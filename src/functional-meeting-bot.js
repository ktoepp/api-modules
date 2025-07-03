require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const Account = require('./models/Account');
const Meeting = require('./models/Meeting');

console.log('�� Starting Functional Meeting Bot...');

const app = express();
const PORT = 3000;

mongoose.connect(process.env.MONGODB_URI);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/accounts/google/callback'
);

// Your meeting bot email (we'll simulate this)
const BOT_EMAIL = process.env.NOTION_BOT_EMAIL || 'meetingbot@yourdomain.com';

app.get('/', (req, res) => {
  res.send(`
    <html>
    <head><title>Functional Meeting Bot</title></head>
    <body style="font-family: Arial; max-width: 1000px; margin: 20px auto; padding: 20px;">
        <h1>🤖 Functional Meeting Bot Automation</h1>
        
        <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>🎯 What This Does:</h3>
            <ul>
                <li>✅ Scans your Google Calendar</li>
                <li>✅ Finds meetings with video links</li>
                <li>🤖 <strong>Actually invites bots to meetings</strong></li>
                <li>💾 Saves everything to database</li>
                <li>📊 Shows you what happened</li>
            </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="/connect-and-automate" style="background: #28a745; color: white; padding: 20px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold;">
                🚀 Connect Calendar & Start Automation
            </a>
        </div>
        
        <div style="background: #fff3cd; padding: 15px; border-radius: 8px;">
            <h4>📋 Bot Configuration:</h4>
            <p><strong>Bot Email:</strong> ${BOT_EMAIL}</p>
            <p><em>The system will invite this email to meetings automatically</em></p>
        </div>
    </body>
    </html>
  `);
});

app.get('/connect-and-automate', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'  // Need this to invite bots
    ],
    prompt: 'consent',
    state: 'functional-bot-' + Date.now()
  });
  
  res.redirect(authUrl);
});

app.get('/api/accounts/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    return res.send(`<h2>❌ OAuth Error: ${error}</h2>`);
  }
  
  if (!code) {
    return res.send('<h2>❌ No authorization code received</h2>');
  }
  
  try {
    console.log('🔑 Getting tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    const oauth2 = google.oauth2('v2');
    const userInfo = await oauth2.userinfo.get({ auth: oauth2Client });
    const userEmail = userInfo.data.email;
    
    console.log('👤 User:', userEmail);
    
    // Save account to database
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
      console.log('✨ Created account:', account._id);
    }
    
    // Get calendar events
    console.log('📅 Scanning calendar...');
    const calendar = google.calendar('v3');
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const events = await calendar.events.list({
      auth: oauth2Client,
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: weekFromNow.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    const eventList = events.data.items || [];
    console.log(`📊 Found ${eventList.length} total events`);
    
    // Filter for meetings with video links
    const meetings = eventList.filter(event => 
      event.hangoutLink || 
      (event.description && (
        event.description.includes('zoom.us') ||
        event.description.includes('teams.microsoft.com') ||
        event.description.includes('meet.google.com')
      ))
    );
    
    console.log(`�� Found ${meetings.length} meetings with video links`);
    
    // Process each meeting and invite bot
    const results = [];
    
    for (const event of meetings) {
      console.log(`🤖 Processing: ${event.summary}`);
      
      try {
        // Check if bot is already invited
        const attendees = event.attendees || [];
        const botAlreadyInvited = attendees.some(a => a.email === BOT_EMAIL);
        
        let inviteResult = { success: false, action: 'skipped', reason: '' };
        
        if (botAlreadyInvited) {
          inviteResult = { success: true, action: 'already_invited', reason: 'Bot already in attendee list' };
          console.log(`  ✅ Bot already invited`);
        } else {
          // Add bot to attendees and update event
          const updatedAttendees = [...attendees, { email: BOT_EMAIL }];
          
          try {
            await calendar.events.update({
              auth: oauth2Client,
              calendarId: 'primary',
              eventId: event.id,
              resource: {
                ...event,
                attendees: updatedAttendees
              }
            });
            
            inviteResult = { success: true, action: 'invited', reason: 'Bot successfully added to meeting' };
            console.log(`  🎉 Bot invited successfully!`);
            
          } catch (inviteError) {
            console.log(`  ❌ Failed to invite bot:`, inviteError.message);
            inviteResult = { success: false, action: 'failed', reason: inviteError.message };
          }
        }
        
        // Save meeting to database
        const meetingDoc = await Meeting.findOneAndUpdate(
          { googleEventId: event.id, accountId: account._id },
          {
            accountId: account._id,
            googleEventId: event.id,
            title: event.summary || 'Untitled Meeting',
            description: event.description || '',
            startTime: new Date(event.start.dateTime || event.start.date),
            endTime: new Date(event.end.dateTime || event.end.date),
            attendees: (event.attendees || []).map(a => a.email),
            meetingUrl: event.hangoutLink || 'Not available',
            meetingPlatform: event.hangoutLink ? 'meet' : 
                           event.description?.includes('zoom.us') ? 'zoom' :
                           event.description?.includes('teams.microsoft.com') ? 'teams' : 'other',
            botInvited: inviteResult.success,
            botInviteTime: inviteResult.success ? new Date() : null,
            status: inviteResult.success ? 'bot_invited' : 'pending'
          },
          { upsert: true, new: true }
        );
        
        results.push({
          meeting: event,
          inviteResult,
          databaseId: meetingDoc._id
        });
        
      } catch (error) {
        console.error(`  ❌ Error processing meeting:`, error.message);
        results.push({
          meeting: event,
          inviteResult: { success: false, action: 'error', reason: error.message }
        });
      }
    }
    
    // Generate results HTML
    let resultsHtml = '';
    if (results.length > 0) {
      resultsHtml = '<h3>🤖 Bot Invitation Results:</h3>';
      results.forEach((result, i) => {
        const meeting = result.meeting;
        const invite = result.inviteResult;
        const startTime = new Date(meeting.start.dateTime || meeting.start.date);
        
        const statusColor = invite.success ? '#28a745' : '#dc3545';
        const statusIcon = invite.success ? '✅' : '❌';
        const actionText = {
          'invited': '🎉 Bot Invited Successfully!',
          'already_invited': '✅ Bot Already Invited',
          'failed': '❌ Invitation Failed',
          'error': '❌ Processing Error',
          'skipped': '⏭️ Skipped'
        }[invite.action] || '❓ Unknown';
        
        resultsHtml += `
          <div style="margin: 15px 0; padding: 20px; background: #f8f9fa; border-left: 4px solid ${statusColor}; border-radius: 8px;">
            <h4 style="margin: 0 0 10px 0;">${meeting.summary || 'Untitled Meeting'}</h4>
            <p><strong>📅 Time:</strong> ${startTime.toLocaleString()}</p>
            <p><strong>👥 Attendees:</strong> ${meeting.attendees ? meeting.attendees.length : 0}</p>
            <p style="color: ${statusColor}; font-weight: bold;">
              <strong>${statusIcon} Status:</strong> ${actionText}
            </p>
            ${invite.reason ? `<p style="font-size: 14px; color: #6c757d;"><em>${invite.reason}</em></p>` : ''}
            ${result.databaseId ? `<p style="font-size: 12px; color: #6c757d;">Database ID: ${result.databaseId}</p>` : ''}
          </div>
        `;
      });
    }
    
    const successCount = results.filter(r => r.inviteResult.success).length;
    const totalMeetings = results.length;
    
    res.send(`
      <html>
      <head><title>Meeting Bot Automation Results</title></head>
      <body style="font-family: Arial; max-width: 1000px; margin: 20px auto; padding: 20px;">
        <h1>🎉 Meeting Bot Automation Complete!</h1>
        
        <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>📊 Summary</h3>
          <p>✅ <strong>Calendar Events Scanned:</strong> ${eventList.length}</p>
          <p>✅ <strong>Meetings with Video Found:</strong> ${totalMeetings}</p>
          <p>✅ <strong>Bot Invitations Successful:</strong> ${successCount}/${totalMeetings}</p>
          <p>✅ <strong>User Account:</strong> ${userEmail}</p>
          <p>✅ <strong>Bot Email:</strong> ${BOT_EMAIL}</p>
        </div>
        
        ${resultsHtml}
        
        <div style="background: ${successCount === totalMeetings ? '#d4edda' : '#fff3cd'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>🎯 What Happened</h3>
          <p>Your meeting bot automation system just:</p>
          <ul>
            <li>✅ Connected to your Google Calendar</li>
            <li>✅ Scanned ${eventList.length} upcoming events</li>
            <li>✅ Identified ${totalMeetings} meetings with video links</li>
            <li>🤖 Attempted to invite bots to all meetings</li>
            <li>💾 Saved ${totalMeetings} meetings to database</li>
          </ul>
          ${successCount === totalMeetings ? 
            '<p style="color: #155724; font-weight: bold;">🎉 All meetings processed successfully!</p>' :
            '<p style="color: #856404;">⚠️ Some invitations had issues - check individual results above.</p>'
          }
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="/" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
            🏠 Back to Home
          </a>
          <a href="/database" style="background: #6c757d; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
            📊 View Database
          </a>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('❌ Main error:', error);
    res.send(`<h2>❌ Error: ${error.message}</h2>`);
  }
});

app.get('/database', async (req, res) => {
  try {
    const meetings = await Meeting.find().sort({ startTime: -1 }).limit(20);
    const accounts = await Account.find().select('-tokens');
    
    let meetingsHtml = '';
    if (meetings.length > 0) {
      meetingsHtml = meetings.map(m => `
        <tr>
          <td>${m.title}</td>
          <td>${m.startTime.toLocaleString()}</td>
          <td>${m.meetingPlatform}</td>
          <td>${m.botInvited ? '✅ Yes' : '❌ No'}</td>
          <td><span style="background: ${m.status === 'bot_invited' ? '#d4edda' : '#fff3cd'}; padding: 3px 8px; border-radius: 3px;">${m.status}</span></td>
        </tr>
      `).join('');
    }
    
    res.send(`
      <html>
      <head><title>Database View</title></head>
      <body style="font-family: Arial; max-width: 1200px; margin: 20px auto; padding: 20px;">
        <h1>📊 Meeting Bot Database</h1>
        
        <h3>👥 Connected Accounts (${accounts.length})</h3>
        <p>📧 ${accounts.map(a => a.email).join(', ')}</p>
        
        <h3>📅 Recent Meetings (${meetings.length})</h3>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead style="background: #f8f9fa;">
            <tr>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Meeting</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Time</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Platform</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Bot Invited</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${meetingsHtml}
          </tbody>
        </table>
        
        <a href="/" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          🏠 Back to Home
        </a>
      </body>
      </html>
    `);
  } catch (error) {
    res.send(`<h2>❌ Database Error: ${error.message}</h2>`);
  }
});

app.listen(PORT, () => {
  console.log(`🤖 Functional Meeting Bot: http://localhost:${PORT}`);
  console.log(`📧 Bot Email: ${BOT_EMAIL}`);
  console.log(`✅ Ready to automate meeting invitations!`);
});
