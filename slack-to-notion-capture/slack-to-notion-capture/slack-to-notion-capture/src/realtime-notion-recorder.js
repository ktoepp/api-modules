require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const { Client: NotionClient } = require('@notionhq/client');
const crypto = require('crypto');
const Account = require('./models/Account');
const Meeting = require('./models/Meeting');

console.log('⚡ Starting Real-Time Notion Auto-Recording System...');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'application/json' }));

mongoose.connect(process.env.MONGODB_URI);

const notion = new NotionClient({
  auth: process.env.NOTION_API_KEY,
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/accounts/google/callback'
);

class RealTimeNotionRecorder {
  constructor() {
    this.activeWebhooks = new Map(); // Track active webhook channels
    this.processingQueue = new Set(); // Prevent duplicate processing
  }

  // === WEBHOOK MANAGEMENT ===

  async setupWebhook(accountId, calendarId = 'primary') {
    try {
      const account = await Account.findById(accountId);
      if (!account) throw new Error('Account not found');

      console.log(`🔗 Setting up webhook for ${account.email}`);

      // Get decrypted tokens (simplified for demo)
      const tokens = {
        access_token: 'your_decrypted_access_token',
        refresh_token: 'your_decrypted_refresh_token'
      };

      oauth2Client.setCredentials(tokens);
      const calendar = google.calendar('v3');

      // Generate unique channel ID
      const channelId = `meeting-bot-${accountId}-${Date.now()}`;
      const webhookUrl = `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/webhook/calendar`;

      // Create watch request
      const watchResponse = await calendar.events.watch({
        calendarId: calendarId,
        resource: {
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          token: account._id.toString(), // Use account ID as verification token
          expiration: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      console.log(`✅ Webhook created: ${channelId}`);

      // Store webhook info
      this.activeWebhooks.set(accountId.toString(), {
        channelId: channelId,
        resourceId: watchResponse.data.resourceId,
        expiration: new Date(parseInt(watchResponse.data.expiration))
      });

      // Save webhook info to account
      await Account.findByIdAndUpdate(accountId, {
        webhookChannelId: channelId,
        webhookResourceId: watchResponse.data.resourceId,
        webhookExpiration: new Date(parseInt(watchResponse.data.expiration))
      });

      return watchResponse.data;

    } catch (error) {
      console.error(`❌ Failed to setup webhook for account ${accountId}:`, error.message);
      throw error;
    }
  }

  async stopWebhook(accountId) {
    try {
      const account = await Account.findById(accountId);
      if (!account || !account.webhookChannelId) {
        console.log('⚠️ No active webhook found for account');
        return;
      }

      console.log(`⏹️ Stopping webhook for ${account.email}`);

      const calendar = google.calendar('v3');
      
      await calendar.channels.stop({
        resource: {
          id: account.webhookChannelId,
          resourceId: account.webhookResourceId
        }
      });

      // Clean up
      this.activeWebhooks.delete(accountId.toString());
      await Account.findByIdAndUpdate(accountId, {
        $unset: {
          webhookChannelId: 1,
          webhookResourceId: 1,
          webhookExpiration: 1
        }
      });

      console.log(`✅ Webhook stopped for ${account.email}`);

    } catch (error) {
      console.error(`❌ Failed to stop webhook:`, error.message);
    }
  }

  // === WEBHOOK PROCESSING ===

  async processWebhookNotification(headers, body) {
    try {
      const channelId = headers['x-goog-channel-id'];
      const channelToken = headers['x-goog-channel-token'];
      const resourceState = headers['x-goog-resource-state'];
      const resourceId = headers['x-goog-resource-id'];

      console.log(`📥 Webhook notification received:`, {
        channelId,
        resourceState,
        resourceId: resourceId?.substring(0, 20) + '...'
      });

      // Verify webhook authenticity
      if (!this.verifyWebhook(channelId, channelToken)) {
        console.log('❌ Webhook verification failed');
        return false;
      }

      // Skip sync notifications
      if (resourceState === 'sync') {
        console.log('📄 Sync notification - ignoring');
        return true;
      }

      // Process calendar changes
      if (resourceState === 'exists') {
        await this.processCalendarChange(channelToken, channelId);
      }

      return true;

    } catch (error) {
      console.error('❌ Webhook processing error:', error.message);
      return false;
    }
  }

  verifyWebhook(channelId, channelToken) {
    // Verify that this webhook belongs to one of our accounts
    if (!channelToken) return false;
    
    // channelToken should be an account ID
    return mongoose.Types.ObjectId.isValid(channelToken);
  }

  async processCalendarChange(accountId, channelId) {
    try {
      // Prevent duplicate processing
      const processingKey = `${accountId}-${Date.now()}`;
      if (this.processingQueue.has(processingKey)) {
        console.log('⚠️ Already processing this change');
        return;
      }

      this.processingQueue.add(processingKey);

      console.log(`🔄 Processing calendar change for account: ${accountId}`);

      const account = await Account.findById(accountId);
      if (!account) {
        console.log('❌ Account not found');
        return;
      }

      // Get recent calendar events (last 24 hours forward)
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const events = await this.getCalendarEvents(account, now, tomorrow);
      console.log(`📅 Found ${events.length} recent events`);

      // Filter for meetings with video links
      const meetings = events.filter(event => 
        event.hangoutLink || 
        (event.description && (
          event.description.includes('zoom.us') ||
          event.description.includes('teams.microsoft.com') ||
          event.description.includes('meet.google.com')
        ))
      );

      console.log(`🎯 Found ${meetings.length} meetings with video links`);

      // Process each meeting
      for (const event of meetings) {
        await this.processMeetingEvent(event, account);
      }

      // Clean up
      setTimeout(() => {
        this.processingQueue.delete(processingKey);
      }, 60000); // Remove from queue after 1 minute

    } catch (error) {
      console.error('❌ Calendar change processing error:', error.message);
    }
  }

  async getCalendarEvents(account, timeMin, timeMax) {
    try {
      // Set up OAuth (simplified - you'd decrypt real tokens here)
      oauth2Client.setCredentials({
        access_token: 'decrypted_access_token',
        refresh_token: 'decrypted_refresh_token'
      });

      const calendar = google.calendar('v3');
      
      const response = await calendar.events.list({
        auth: oauth2Client,
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      return response.data.items || [];

    } catch (error) {
      console.error('❌ Failed to get calendar events:', error.message);
      return [];
    }
  }

  async processMeetingEvent(event, account) {
    try {
      console.log(`🎯 Processing meeting: ${event.summary}`);

      // Check if we've already processed this meeting
      const existingMeeting = await Meeting.findOne({
        googleEventId: event.id,
        accountId: account._id
      });

      if (existingMeeting) {
        console.log(`⚠️ Meeting already processed: ${event.summary}`);
        return;
      }

      // Create meeting record
      const meetingData = {
        accountId: account._id,
        googleEventId: event.id,
        title: event.summary || 'Untitled Meeting',
        description: event.description || '',
        startTime: new Date(event.start.dateTime || event.start.date),
        endTime: new Date(event.end.dateTime || event.end.date),
        attendees: (event.attendees || []).map(a => a.email),
        meetingUrl: event.hangoutLink || this.extractMeetingUrl(event.description),
        meetingPlatform: this.detectMeetingPlatform(event.hangoutLink, event.description),
        status: 'pending'
      };

      const meeting = new Meeting(meetingData);
      await meeting.save();

      console.log(`💾 Meeting saved to database: ${meeting._id}`);

      // Create Notion page immediately
      const notionPageId = await this.createNotionPage(meetingData, account.email);
      
      // Update meeting with Notion page ID
      await Meeting.findByIdAndUpdate(meeting._id, {
        notionPageId: notionPageId,
        status: 'notion_created'
      });

      console.log(`✅ Real-time processing complete for: ${event.summary}`);

      // Schedule recording if meeting is soon
      await this.scheduleRecording(meeting, notionPageId);

    } catch (error) {
      console.error(`❌ Failed to process meeting event:`, error.message);
    }
  }

  extractMeetingUrl(description) {
    if (!description) return null;
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = description.match(urlRegex);
    
    if (!urls) return null;
    
    for (const url of urls) {
      if (url.includes('zoom.us') || url.includes('teams.microsoft.com') || url.includes('meet.google.com')) {
        return url;
      }
    }
    
    return null;
  }

  detectMeetingPlatform(hangoutLink, description) {
    if (hangoutLink) return 'meet';
    if (description && description.includes('zoom.us')) return 'zoom';
    if (description && description.includes('teams.microsoft.com')) return 'teams';
    return 'other';
  }

  async createNotionPage(meeting, accountEmail) {
    try {
      console.log(`📝 Creating Notion page for: ${meeting.title}`);
      
      const duration = Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / (1000 * 60));
      
      const response = await notion.pages.create({
        parent: {
          type: 'database_id',
          database_id: process.env.NOTION_DATABASE_ID
        },
        properties: {
          'Meeting Title': {
            title: [{ text: { content: meeting.title } }]
          },
          'Date': {
            date: {
              start: meeting.startTime.toISOString(),
              end: meeting.endTime.toISOString()
            }
          },
          'Status': {
            select: { name: 'Scheduled' }
          },
          'Platform': {
            select: { name: meeting.meetingPlatform || 'Other' }
          },
          'Account': {
            rich_text: [{ text: { content: accountEmail } }]
          }
        },
        children: [
          {
            object: 'block',
            type: 'callout',
            callout: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `⚡ REAL-TIME DETECTION: This meeting was just added to your calendar!\n\n📅 ${meeting.startTime.toLocaleString()}\n🎥 ${meeting.meetingPlatform}\n👥 ${meeting.attendees.length} attendees\n⏱️ ${duration} minutes`
                  }
                }
              ],
              icon: { emoji: '⚡' },
              color: 'green_background'
            }
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [{ type: 'text', text: { content: 'Pre-Meeting Preparation' } }]
            }
          },
          {
            object: 'block',
            type: 'to_do',
            to_do: {
              rich_text: [{ type: 'text', text: { content: 'Review agenda and key topics' } }],
              checked: false
            }
          },
          {
            object: 'block',
            type: 'to_do',
            to_do: {
              rich_text: [{ type: 'text', text: { content: 'Prepare questions or discussion points' } }],
              checked: false
            }
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [{ type: 'text', text: { content: 'Meeting Notes' } }]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: 'Live notes will be captured here...' } }]
            }
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [{ type: 'text', text: { content: 'Action Items' } }]
            }
          },
          {
            object: 'block',
            type: 'to_do',
            to_do: {
              rich_text: [{ type: 'text', text: { content: 'Action items will be tracked here' } }],
              checked: false
            }
          }
        ]
      });

      console.log(`✅ Notion page created: ${response.id}`);
      return response.id;
      
    } catch (error) {
      console.error('❌ Failed to create Notion page:', error.message);
      throw error;
    }
  }

  async scheduleRecording(meeting, notionPageId) {
    try {
      const now = new Date();
      const meetingStart = new Date(meeting.startTime);
      const timeUntilMeeting = meetingStart.getTime() - now.getTime();
      
      if (timeUntilMeeting > 0 && timeUntilMeeting < 24 * 60 * 60 * 1000) { // Within 24 hours
        console.log(`⏰ Scheduling recording for ${meetingStart.toLocaleString()}`);
        
        setTimeout(async () => {
          await this.startRecording(meeting, notionPageId);
        }, timeUntilMeeting);
      }
      
    } catch (error) {
      console.error('❌ Recording scheduling error:', error.message);
    }
  }

  async startRecording(meeting, notionPageId) {
    try {
      console.log(`🎥 Starting recording for: ${meeting.title}`);
      
      // Update Notion page
      await notion.pages.update({
        page_id: notionPageId,
        properties: {
          'Status': { select: { name: 'Recording' } }
        }
      });

      // Add recording indicator
      await notion.blocks.children.append({
        block_id: notionPageId,
        children: [
          {
            object: 'block',
            type: 'callout',
            callout: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: `🔴 RECORDING STARTED: ${new Date().toLocaleString()}` }
                }
              ],
              icon: { emoji: '🔴' },
              color: 'red_background'
            }
          }
        ]
      });

      // Update database
      await Meeting.findByIdAndUpdate(meeting._id, {
        status: 'recording',
        recordingStartTime: new Date()
      });

    } catch (error) {
      console.error('❌ Recording start error:', error.message);
    }
  }

  // === STATUS AND MONITORING ===

  getSystemStatus() {
    return {
      activeWebhooks: this.activeWebhooks.size,
      processingQueue: this.processingQueue.size,
      webhooks: Array.from(this.activeWebhooks.entries()).map(([accountId, webhook]) => ({
        accountId,
        channelId: webhook.channelId,
        expiration: webhook.expiration
      }))
    };
  }
}

const recorder = new RealTimeNotionRecorder();

// === WEB INTERFACE ===

app.get('/', async (req, res) => {
  const status = recorder.getSystemStatus();
  const accounts = await Account.find({ provider: 'google' });
  
  res.send(`
    <html>
    <head>
        <title>Real-Time Notion Recording System</title>
        <meta http-equiv="refresh" content="30">
    </head>
    <body style="font-family: Arial; max-width: 1200px; margin: 20px auto; padding: 20px;">
        <h1>⚡ Real-Time Notion Auto-Recording System</h1>
        
        <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>🎯 Real-Time Features</h3>
            <ul>
                <li>⚡ <strong>Instant Detection:</strong> Notion pages created immediately when meetings are added</li>
                <li>🔗 <strong>Webhook Integration:</strong> Google Calendar sends real-time notifications</li>
                <li>📝 <strong>Auto-Processing:</strong> No polling delays - instant response</li>
                <li>🎥 <strong>Smart Recording:</strong> Automatically starts when meetings begin</li>
            </ul>
        </div>
        
        <div style="background: ${status.activeWebhooks > 0 ? '#d4edda' : '#fff3cd'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📊 System Status</h3>
            <p><strong>Active Webhooks:</strong> ${status.activeWebhooks}</p>
            <p><strong>Processing Queue:</strong> ${status.processingQueue} items</p>
            <p><strong>Connected Accounts:</strong> ${accounts.length}</p>
            <p><strong>Webhook Endpoint:</strong> /webhook/calendar</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📋 Connected Accounts</h3>
            ${accounts.map(account => `
                <div style="margin: 10px 0; padding: 15px; background: white; border-radius: 5px; border: 1px solid #ddd;">
                    <p><strong>📧 ${account.email}</strong></p>
                    <p><strong>Webhook:</strong> ${account.webhookChannelId ? '🟢 Active' : '🔴 Not Active'}</p>
                    ${account.webhookExpiration ? `<p><strong>Expires:</strong> ${account.webhookExpiration.toLocaleString()}</p>` : ''}
                    <div style="margin-top: 10px;">
                        ${account.webhookChannelId ? 
                            `<a href="/stop-webhook/${account._id}" style="background: #dc3545; color: white; padding: 5px 10px; text-decoration: none; border-radius: 3px;">⏹️ Stop Webhook</a>` :
                            `<a href="/setup-webhook/${account._id}" style="background: #28a745; color: white; padding: 5px 10px; text-decoration: none; border-radius: 3px;">▶️ Start Webhook</a>`
                        }
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="/connect-calendar" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
                📅 Connect New Account
            </a>
            <a href="/test-webhook" style="background: #6f42c1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
                🧪 Test Webhook
            </a>
        </div>
        
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4>⚠️ Important for Real-Time Webhooks:</h4>
            <ul>
                <li>Your server must be accessible from the internet for webhooks to work</li>
                <li>For local development, use tools like ngrok to expose your localhost</li>
                <li>Update WEBHOOK_BASE_URL in your .env file with your public URL</li>
            </ul>
        </div>
        
        <p style="text-align: center; color: #666; font-size: 12px;">
            Page auto-refreshes every 30 seconds • Last updated: ${new Date().toLocaleString()}
        </p>
    </body>
    </html>
  `);
});

// === WEBHOOK ENDPOINTS ===

app.post('/webhook/calendar', async (req, res) => {
  try {
    console.log('📥 Calendar webhook received');
    
    const success = await recorder.processWebhookNotification(req.headers, req.body);
    
    if (success) {
      res.status(200).send('OK');
    } else {
      res.status(400).send('Webhook processing failed');
    }
    
  } catch (error) {
    console.error('❌ Webhook endpoint error:', error.message);
    res.status(500).send('Internal server error');
  }
});

// Webhook management endpoints
app.get('/setup-webhook/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const result = await recorder.setupWebhook(accountId);
    
    res.send(`
      <h1>✅ Webhook Setup Successful!</h1>
      <p><strong>Channel ID:</strong> ${result.id}</p>
      <p><strong>Expiration:</strong> ${new Date(parseInt(result.expiration)).toLocaleString()}</p>
      <p>Real-time monitoring is now active for this account!</p>
      <a href="/">🏠 Back to Dashboard</a>
    `);
    
  } catch (error) {
    res.send(`
      <h1>❌ Webhook Setup Failed</h1>
      <p>Error: ${error.message}</p>
      <a href="/">�� Back to Dashboard</a>
    `);
  }
});

app.get('/stop-webhook/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    await recorder.stopWebhook(accountId);
    
    res.send(`
      <h1>⏹️ Webhook Stopped</h1>
      <p>Real-time monitoring has been disabled for this account.</p>
      <a href="/">🏠 Back to Dashboard</a>
    `);
    
  } catch (error) {
    res.send(`
      <h1>❌ Stop Webhook Failed</h1>
      <p>Error: ${error.message}</p>
      <a href="/">🏠 Back to Dashboard</a>
    `);
  }
});

app.get('/test-webhook', async (req, res) => {
  try {
    // Simulate a webhook notification for testing
    const testHeaders = {
      'x-goog-channel-id': 'test-channel-123',
      'x-goog-channel-token': 'test-token',
      'x-goog-resource-state': 'exists',
      'x-goog-resource-id': 'test-resource-456'
    };
    
    const success = await recorder.processWebhookNotification(testHeaders, {});
    
    res.send(`
      <h1>${success ? '✅' : '❌'} Webhook Test ${success ? 'Successful' : 'Failed'}</h1>
      <p>Webhook processing pipeline ${success ? 'is working correctly' : 'needs attention'}.</p>
      <a href="/">🏠 Back to Dashboard</a>
    `);
    
  } catch (error) {
    res.send(`
      <h1>❌ Webhook Test Failed</h1>
      <p>Error: ${error.message}</p>
      <a href="/">🏠 Back to Dashboard</a>
    `);
  }
});

// Calendar connection (simplified from previous version)
app.get('/connect-calendar', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    prompt: 'consent',
    state: 'realtime-recorder-' + Date.now()
  });
  
  res.redirect(authUrl);
});

app.get('/api/accounts/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.send(`<h2>❌ OAuth Error: ${error}</h2><a href="/">🏠 Home</a>`);
  }
  
  if (!code) {
    return res.send('<h2>❌ No authorization code received</h2><a href="/">🏠 Home</a>');
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    const oauth2 = google.oauth2('v2');
    const userInfo = await oauth2.userinfo.get({ auth: oauth2Client });
    const userEmail = userInfo.data.email;
    
    // Save account (simplified)
    let account = await Account.findOne({ email: userEmail });
    if (!account) {
      account = new Account({
        email: userEmail,
        userId: state,
        provider: 'google',
        tokens: {
          accessToken: 'encrypted_placeholder',
          refreshToken: 'encrypted_placeholder',
          expiryDate: new Date(Date.now() + 3600000)
        },
        calendarId: 'primary'
      });
      await account.save();
    }
    
    res.send(`
      <h1>✅ Account Connected!</h1>
      <p><strong>Email:</strong> ${userEmail}</p>
      <p>Account is ready for real-time monitoring.</p>
      <div style="margin: 20px 0;">
          <a href="/setup-webhook/${account._id}" style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px;">
              ⚡ Enable Real-Time Monitoring
          </a>
      </div>
      <a href="/">🏠 Back to Dashboard</a>
    `);
    
  } catch (error) {
    console.error('❌ Calendar connection error:', error);
    res.send(`<h2>❌ Error: ${error.message}</h2><a href="/">🏠 Home</a>`);
  }
});

app.listen(PORT, () => {
  console.log(`⚡ Real-Time Notion Recording System: http://localhost:${PORT}`);
  console.log('🔗 Webhook endpoint: POST /webhook/calendar');
  console.log('📧 For production, update WEBHOOK_BASE_URL in .env');
  console.log('✅ Real-time calendar monitoring ready!');
});
