require('dotenv').config();
const { google } = require('googleapis');
const mongoose = require('mongoose');
const Account = require('./models/Account');

async function testGoogleAuth() {
  try {
    console.log('🧪 Testing Google Auth (standalone)...');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
    
    // Check Google environment variables
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/accounts/google/callback';
    
    console.log('\n📋 Environment check:');
    console.log('  GOOGLE_CLIENT_ID:', clientId ? (clientId.includes('your-') ? '❌ Not configured' : '✅ Set') : '❌ Missing');
    console.log('  GOOGLE_CLIENT_SECRET:', clientSecret ? (clientSecret.includes('your-') ? '❌ Not configured' : '✅ Set') : '❌ Missing');
    console.log('  GOOGLE_REDIRECT_URI:', redirectUri);
    
    if (!clientId || clientId.includes('your-') || !clientSecret || clientSecret.includes('your-')) {
      console.log('\n💡 Google OAuth not configured yet. This is normal!');
      console.log('📋 To set up Google OAuth:');
      console.log('1. Go to https://console.cloud.google.com/');
      console.log('2. Create a project or select existing');
      console.log('3. Enable Google Calendar API and Gmail API');
      console.log('4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID');
      console.log('5. Application type: Web application');
      console.log('6. Authorized redirect URIs: http://localhost:3000/api/accounts/google/callback');
      console.log('7. Copy Client ID and Client Secret to your .env file');
      
      await mongoose.disconnect();
      return;
    }
    
    // Test Google OAuth setup
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/gmail.send'
      ],
      prompt: 'consent',
      state: 'test-user-123'
    });
    
    console.log('\n✅ Google OAuth client created successfully!');
    console.log('🔗 Test auth URL: ' + authUrl.substring(0, 100) + '...');
    console.log('\n✅ Ready for Google Calendar integration!');
    
    await mongoose.disconnect();
    console.log('✅ Test completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await mongoose.disconnect();
  }
}

testGoogleAuth();
