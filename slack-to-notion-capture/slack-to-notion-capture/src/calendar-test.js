require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const Account = require('./models/Account');
const crypto = require('crypto-js');

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/callback'
);

app.get('/', (req, res) => {
  res.send(`
    <h1>📅 Calendar API Test</h1>
    <div style="max-width: 800px; font-family: Arial, sans-serif;">
        <h3>🎯 What we'll test:</h3>
        <ul>
            <li>✅ Connect to Google (OAuth working!)</li>
            <li>📅 Fetch your calendar events</li>
            <li>🔍 Find meetings with video links</li>
            <li>💾 Save to database</li>
            <li>🤖 Simulate bot invitation</li>
        </ul>
        <br>
        <a href="/auth" style="background: #4285f4; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px;">
            🚀 Start Calendar Test
        </a>
    </div>
  `);
});

app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    prompt: 'consent',
    state: 'calendar-test-' + Date.now()
  });
  
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code) {
    return res.send('❌ No authorization code received');
  }
  
  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Get user info
    const oauth2 = google.oauth2('v2');
    const userInfo = await oauth2.userinfo.get({ auth: oauth2Client });
    const userEmail = userInfo.data.email;
    
    console.log('👤 Authenticated:', userEmail);
    
    // Save account to database
    const encryptedTokens = {
      accessToken: crypto.AES.encrypt(tokens.access_token, process.env.ENCRYPTION_KEY).toString(),
      refreshToken: crypto.AES.encrypt(tokens.refresh_token, process.env.ENCRYPTION_KEY).toString(),
      expiryDate: new Date(tokens.expiry_date)
    };
    
    const account = await Account.findOneAndUpdate(
      { email: userEmail, userId: state },
      {
        email: userEmail,
        userId: state,
        provider: 'google',
        tokens: encryptedTokens,
        calendarId: 'primary'
      },
      { upsert: true, new: true }
    );
    
    console.log('💾 Account saved:', account._id);
    
    // Fetch calendar events
    const calendar = google.calendar('v3');
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    console.log('📅 Fetching calendar events...');
    
    const events = await calendar.events.list({
      auth: oauth2Client,
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: weekFromNow.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    const eventList = events.data.items;
    console.log(`📊 Found ${eventList.length} events`);
    
    // Filter for meetings with video links
    const meetings = eventList.filter(event => 
      event.hangoutLink || 
      (event.description && (
        event.description.includes('zoom.us') ||
        event.description.includes('teams.microsoft.com') ||
        event.description.includes('meet.google.com')
      ))
    );
    
    console.log(`🎯 Found ${meetings.length} meetings with video links`);
    
    // Generate HTML response
    let meetingsHtml = '';
    if (meetings.length > 0) {
      meetingsHtml = '<h3>🎯 Meetings Found:</h3><ul>';
      meetings.forEach(meeting => {
        const startTime = new Date(meeting.start.dateTime || meeting.start.date);
        const platform = meeting.hangoutLink ? 'Google Meet' : 
                         meeting.description?.includes('zoom.us') ? 'Zoom' :
                         meeting.description?.includes('teams.microsoft.com') ? 'Teams' : 'Other';
        
        meetingsHtml += `
          <li style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 5px;">
            <strong>${meeting.summary || 'Untitled Meeting'}</strong><br>
            📅 ${startTime.toLocaleString()}<br>
            🎥 Platform: ${platform}<br>
            👥 Attendees: ${meeting.attendees ? meeting.attendees.length : 0}
            ${meeting.hangoutLink ? `<br>🔗 <a href="${meeting.hangoutLink}" target="_blank">Join Meeting</a>` : ''}
          </li>
        `;
      });
      meetingsHtml += '</ul>';
    } else {
      meetingsHtml = '<p>📭 No meetings with video links found in the next 7 days.</p>';
    }
    
    res.send(`
      <div style="max-width: 800px; font-family: Arial, sans-serif; margin: 20px;">
        <h2>🎉 Calendar API Success!</h2>
        
        <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3>✅ What worked:</h3>
          <ul>
            <li>✅ OAuth authentication successful</li>
            <li>✅ Account saved to database (ID: ${account._id})</li>
            <li>✅ Calendar API access granted</li>
            <li>✅ Found ${eventList.length} total events</li>
            <li>✅ Identified ${meetings.length} meetings with video links</li>
          </ul>
        </div>
        
        <div style="background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3>📊 Account Details:</h3>
          <p><strong>Email:</strong> ${userEmail}</p>
          <p><strong>Account ID:</strong> ${account._id}</p>
          <p><strong>Status:</strong> ${account.isActive ? 'Active' : 'Inactive'}</p>
        </div>
        
        ${meetingsHtml}
        
        <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3>🚀 Next Steps:</h3>
          <ul>
            <li>✅ Google Calendar integration working</li>
            <li>🔄 Add meeting bot invitation logic</li>
            <li>🔄 Create automation rules</li>
            <li>🔄 Build dashboard interface</li>
          </ul>
        </div>
        
        <a href="/" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          🏠 Back to Home
        </a>
        <a href="/api/accounts" style="background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-left: 10px;">
          📊 View Database
        </a>
      </div>
    `);
    
  } catch (error) {
    console.error('❌ Calendar API error:', error);
    res.send(`❌ Error: ${error.message}`);
  }
});

// API endpoint to view saved accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await Account.find().select('-tokens');
    res.json({ 
      success: true,
      count: accounts.length,
      accounts 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log('📅 Calendar API Test Server: http://localhost:3000');
});
