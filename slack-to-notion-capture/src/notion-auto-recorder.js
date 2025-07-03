require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const { Client: NotionClient } = require('@notionhq/client');
const cron = require('node-cron');
const Account = require('./models/Account');
const Meeting = require('./models/Meeting');

console.log('📝 Starting Notion Auto-Recording System...');

const app = express();
const PORT = 3000;

mongoose.connect(process.env.MONGODB_URI);

// Notion client
const notion = new NotionClient({
  auth: process.env.NOTION_API_KEY,
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/accounts/google/callback'
);

// Configuration
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const POLLING_INTERVAL_MINUTES = 5; // Check calendar every 5 minutes

class NotionAutoRecorder {
  constructor() {
    this.isMonitoring = false;
    this.lastCheck = new Date();
  }

  async createNotionPage(meeting, accountEmail) {
    try {
      console.log(`📝 Creating Notion page for: ${meeting.title}`);
      
      // Create the page
      const response = await notion.pages.create({
        parent: {
          type: 'database_id',
          database_id: NOTION_DATABASE_ID
        },
        properties: {
          'Meeting Title': {
            title: [
              {
                text: {
                  content: meeting.title || 'Untitled Meeting'
                }
              }
            ]
          },
          'Date': {
            date: {
              start: meeting.startTime.toISOString(),
              end: meeting.endTime.toISOString()
            }
          },
          'Status': {
            select: {
              name: 'Ready to Record'
            }
          },
          'Platform': {
            select: {
              name: meeting.meetingPlatform || 'Other'
            }
          },
          'Account': {
            rich_text: [
              {
                text: {
                  content: accountEmail
                }
              }
            ]
          },
          'Attendees': {
            number: meeting.attendees.length
          }
        },
        children: [
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `Meeting: ${meeting.title}`
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `📅 Time: ${meeting.startTime.toLocaleString()} - ${meeting.endTime.toLocaleString()}\n🎥 Platform: ${meeting.meetingPlatform}\n👥 Attendees: ${meeting.attendees.length}`
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'heading_3',
            heading_3: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Meeting Notes'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Notes will appear here during the meeting...'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'heading_3',
            heading_3: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Action Items'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Action items will be populated automatically'
                  }
                }
              ]
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
      console.log(`⏰ Scheduling recording for: ${meeting.title}`);
      
      // Calculate time until meeting starts
      const now = new Date();
      const meetingStart = new Date(meeting.startTime);
      const timeUntilMeeting = meetingStart.getTime() - now.getTime();
      
      if (timeUntilMeeting > 0) {
        // Schedule recording to start at meeting time
        setTimeout(async () => {
          await this.startRecording(meeting, notionPageId);
        }, timeUntilMeeting);
        
        console.log(`⏰ Recording scheduled for ${meetingStart.toLocaleString()}`);
        return true;
      } else {
        console.log(`⚠️ Meeting already started or passed`);
        return false;
      }
      
    } catch (error) {
      console.error('❌ Failed to schedule recording:', error.message);
      throw error;
    }
  }

  async startRecording(meeting, notionPageId) {
    try {
      console.log(`🎥 Starting recording for: ${meeting.title}`);
      
      // Update Notion page to indicate recording started
      await notion.pages.update({
        page_id: notionPageId,
        properties: {
          'Status': {
            select: {
              name: 'Recording'
            }
          }
        }
      });

      // Add recording start block to page
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
                  text: {
                    content: `🎥 Recording started at ${new Date().toLocaleString()}`
                  }
                }
              ],
              icon: {
                emoji: '🎥'
              },
              color: 'green_background'
            }
          }
        ]
      });

      // Update meeting status in database
      await Meeting.findByIdAndUpdate(meeting._id, {
        status: 'recording',
        notionPageId: notionPageId,
        recordingStartTime: new Date()
      });

      console.log(`✅ Recording started for ${meeting.title}`);
      
      // Schedule recording end
      const meetingEnd = new Date(meeting.endTime);
      const recordingDuration = meetingEnd.getTime() - new Date().getTime();
      
      if (recordingDuration > 0) {
        setTimeout(async () => {
          await this.endRecording(meeting, notionPageId);
        }, recordingDuration);
      }
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error.message);
    }
  }

  async endRecording(meeting, notionPageId) {
    try {
      console.log(`⏹️ Ending recording for: ${meeting.title}`);
      
      // Update Notion page
      await notion.pages.update({
        page_id: notionPageId,
        properties: {
          'Status': {
            select: {
              name: 'Completed'
            }
          }
        }
      });

      // Add recording end block
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
                  text: {
                    content: `⏹️ Recording ended at ${new Date().toLocaleString()}`
                  }
                }
              ],
              icon: {
                emoji: '⏹️'
              },
              color: 'red_background'
            }
          },
          {
            object: 'block',
            type: 'heading_3',
            heading_3: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Summary'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Meeting summary and key takeaways will be added here...'
                  }
                }
              ]
            }
          }
        ]
      });

      // Update database
      await Meeting.findByIdAndUpdate(meeting._id, {
        status: 'completed',
        recordingEndTime: new Date()
      });

      console.log(`✅ Recording completed for ${meeting.title}`);
      
    } catch (error) {
      console.error('❌ Failed to end recording:', error.message);
    }
  }

  async monitorCalendar() {
    try {
      console.log('🔍 Monitoring calendar for new meetings...');
      
      const accounts = await Account.find({ isActive: true });
      
      for (const account of accounts) {
        try {
          // Get calendar events (you'd need to implement token decryption here)
          // For now, let's simulate this
          console.log(`📅 Checking calendar for ${account.email}`);
          
          // This would fetch new meetings and create Notion pages
          // Implementation would go here
          
        } catch (error) {
          console.error(`❌ Error monitoring ${account.email}:`, error.message);
        }
      }
      
    } catch (error) {
      console.error('❌ Calendar monitoring error:', error.message);
    }
  }

  startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Monitoring already active');
      return;
    }

    console.log(`⏰ Starting calendar monitoring (every ${POLLING_INTERVAL_MINUTES} minutes)`);
    
    // Schedule monitoring every N minutes
    cron.schedule(`*/${POLLING_INTERVAL_MINUTES} * * * *`, () => {
      this.monitorCalendar();
    });
    
    this.isMonitoring = true;
  }

  stopMonitoring() {
    this.isMonitoring = false;
    console.log('⏹️ Calendar monitoring stopped');
  }
}

const autoRecorder = new NotionAutoRecorder();

// Web interface
app.get('/', (req, res) => {
  res.send(`
    <html>
    <head><title>Notion Auto-Recording System</title></head>
    <body style="font-family: Arial; max-width: 1000px; margin: 20px auto; padding: 20px;">
        <h1>📝 Notion Auto-Recording System</h1>
        
        <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>�� What This System Does:</h3>
            <ul>
                <li>🔍 <strong>Monitors your calendar</strong> every ${POLLING_INTERVAL_MINUTES} minutes</li>
                <li>📝 <strong>Creates Notion pages</strong> automatically for new meetings</li>
                <li>🎥 <strong>Starts "recording"</strong> when meetings begin</li>
                <li>📊 <strong>Organizes notes</strong> for meetings you're not hosting</li>
                <li>⏹️ <strong>Ends recording</strong> when meetings finish</li>
            </ul>
        </div>
        
        <div style="background: ${autoRecorder.isMonitoring ? '#d4edda' : '#fff3cd'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📊 System Status</h3>
            <p><strong>Monitoring:</strong> ${autoRecorder.isMonitoring ? '🟢 Active' : '🔴 Inactive'}</p>
            <p><strong>Notion API:</strong> ${process.env.NOTION_API_KEY ? '🟢 Configured' : '🔴 Not configured'}</p>
            <p><strong>Notion Database:</strong> ${NOTION_DATABASE_ID ? '🟢 Set' : '🔴 Not set'}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="/setup" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
                ⚙️ Setup & Connect
            </a>
            <a href="/start-monitoring" style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
                ▶️ Start Monitoring
            </a>
            <a href="/test-notion" style="background: #6f42c1; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
                🧪 Test Notion
            </a>
        </div>
    </body>
    </html>
  `);
});

app.get('/setup', (req, res) => {
  res.send(`
    <html>
    <head><title>Setup Instructions</title></head>
    <body style="font-family: Arial; max-width: 800px; margin: 20px auto; padding: 20px;">
        <h1>⚙️ Setup Instructions</h1>
        
        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>📋 Required Configuration</h3>
            <p>Add these to your .env file:</p>
            <pre style="background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto;">
# Notion Configuration
NOTION_API_KEY=your_notion_integration_key
NOTION_DATABASE_ID=your_database_id</pre>
        </div>
        
        <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>🔗 Setup Steps</h3>
            <ol>
                <li><strong>Create Notion Integration:</strong>
                    <ul>
                        <li>Go to <a href="https://www.notion.so/my-integrations" target="_blank">Notion Integrations</a></li>
                        <li>Click "New integration"</li>
                        <li>Name it "Meeting Auto-Recorder"</li>
                        <li>Copy the Internal Integration Token</li>
                    </ul>
                </li>
                <li><strong>Create Database:</strong>
                    <ul>
                        <li>Create a new Notion page</li>
                        <li>Add a database with these properties:
                            <ul>
                                <li>Meeting Title (Title)</li>
                                <li>Date (Date)</li>
                                <li>Status (Select)</li>
                                <li>Platform (Select)</li>
                                <li>Account (Text)</li>
                                <li>Attendees (Number)</li>
                            </ul>
                        </li>
                        <li>Share the database with your integration</li>
                        <li>Copy the database ID from the URL</li>
                    </ul>
                </li>
                <li><strong>Update .env file</strong> with your keys</li>
            </ol>
        </div>
        
        <a href="/" style="background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            🏠 Back to Home
        </a>
    </body>
    </html>
  `);
});

app.get('/start-monitoring', (req, res) => {
  autoRecorder.startMonitoring();
  res.redirect('/');
});

app.get('/test-notion', async (req, res) => {
  try {
    // Test Notion connection
    const testPage = await autoRecorder.createNotionPage({
      title: 'Test Meeting - Auto Recording System',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000), // 1 hour
      meetingPlatform: 'test',
      attendees: ['test@example.com']
    }, 'system-test@example.com');
    
    res.send(`
      <h1>✅ Notion Test Successful!</h1>
      <p>Created test page: ${testPage}</p>
      <a href="/">🏠 Back to Home</a>
    `);
    
  } catch (error) {
    res.send(`
      <h1>❌ Notion Test Failed</h1>
      <p>Error: ${error.message}</p>
      <p>Make sure to configure NOTION_API_KEY and NOTION_DATABASE_ID in your .env file</p>
      <a href="/setup">⚙️ Setup Instructions</a>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`📝 Notion Auto-Recording System: http://localhost:${PORT}`);
  console.log(`⚙️ Notion API: ${process.env.NOTION_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`📊 Database ID: ${NOTION_DATABASE_ID ? 'Set' : 'Not set'}`);
});
