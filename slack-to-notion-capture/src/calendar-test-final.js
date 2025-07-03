require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const Account = require('./models/Account');

console.log('🚀 Starting Calendar Test Server...');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/accounts/google/callback'
);

app.get('/', (req, res) => {
  console.log('📍 Home page accessed');
  res.send(`
    <html>
    <head><title>Calendar Test</title></head>
    <body style="font-family: Arial; max-width: 800px; margin: 50px auto; padding: 20px;">
        <h1>📅 Calendar API Test</h1>
        <p>Test your Google Calendar integration</p>
        <br>
        <a href="/auth" style="background: #4285f4; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px;">
            📅 Access Your Calendar
        </a>
        <br><br>
        <a href="/api/accounts" style="background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            📊 View Database
        </a>
    </body>
    </html>
  `);
});

app.get('/auth', (req, res) => {
  console.log('🔐 Starting OAuth flow');
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar.readonly'
    ],
    prompt: 'consent',
    state: 'test-' + Date.now()
  });
  
  res.redirect(authUrl);
});

app.get('/api/accounts/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  console.log('�� OAuth callback received');
  
  if (error) {
    return res.send(`<h2>❌ OAuth Error: ${error}</h2>`);
  }
  
  if (!code) {
    return res.send('<h2>❌ No authorization code received</h2>');
  }
  
  try {
    console.log('🔑 Exchanging code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    console.log('👤 Getting user info...');
    const oauth2 = google.oauth2('v2');
    const userInfo = await oauth2.userinfo.get({ auth: oauth2Client });
    const userEmail = userInfo.data.email;
    
    console.log('📧 User email:', userEmail);
    
    console.log('📅 Fetching calendar events...');
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
    console.log(`📊 Found ${eventList.length} calendar events`);
    
    const meetings = eventList.filter(event => 
      event.hangoutLink || 
      (event.description && (
        event.description.includes('zoom.us') ||
        event.description.includes('teams.microsoft.com') ||
        event.description.includes('meet.google.com')
      ))
    );
    
    console.log(`🎯 Found ${meetings.length} meetings with video links`);
    
    let meetingsHtml = '';
    if (meetings.length > 0) {
      meetingsHtml = '<h3>🎯 Meetings Found:</h3>';
      meetings.forEach((meeting) => {
        const startTime = new Date(meeting.start.dateTime || meeting.start.date);
        const platform = meeting.hangoutLink ? 'Google Meet' : 
                         meeting.description?.includes('zoom.us') ? 'Zoom' :
                         meeting.description?.includes('teams.microsoft.com') ? 'Teams' : 'Other';
        
        meetingsHtml += `
          <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 5px;">
            <h4>${meeting.summary || 'Untitled Meeting'}</h4>
            <p><strong>📅 Time:</strong> ${startTime.toLocaleString()}</p>
            <p><strong>🎥 Platform:</strong> ${platform}</p>
            <p><strong>👥 Attendees:</strong> ${meeting.attendees ? meeting.attendees.length : 0}</p>
            <p style="color: #28a745;"><strong>🤖 Status:</strong> Ready for bot invitation!</p>
          </div>
        `;
      });
    } else {
      meetingsHtml = `
        <div style="background: #fff3cd; padding: 15px; border-radius: 5px;">
          <h3>📭 No meetings with video links found</h3>
          <p>Scanned ${eventList.length} events in the next 7 days</p>
        </div>
      `;
    }
    
    res.send(`
      <html>
      <head><title>Calendar Success</title></head>
      <body style="font-family: Arial; max-width: 900px; margin: 20px auto; padding: 20px;">
        <h1>🎉 Calendar Integration Success!</h1>
        
        <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>✅ Integration Status</h3>
          <p>✅ OAuth authentication successful</p>
          <p>✅ Calendar API access granted</p>
          <p>✅ User: ${userEmail}</p>
          <p>✅ Events found: ${eventList.length}</p>
          <p>✅ Meetings with video: ${meetings.length}</p>
        </div>
        
        ${meetingsHtml}
        
        <div style="margin: 30px 0;">
          <a href="/" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            🏠 Back to Home
          </a>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('❌ Calendar API error:', error);
    res.send(`<h2>❌ Error: ${error.message}</h2>`);
  }
});

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
  console.log(`🎉 Calendar Test Server running!`);
  console.log(`📍 Open: http://localhost:${PORT}`);
  console.log(`✅ Ready to test Google Calendar integration!`);
});
