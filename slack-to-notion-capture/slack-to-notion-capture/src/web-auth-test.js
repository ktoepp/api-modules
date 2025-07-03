require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const Account = require('./models/Account');
const crypto = require('crypto-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

// Create OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Home page with auth button
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Meeting Bot - Google Auth Test</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            .button { background: #4285f4; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; }
            .button:hover { background: #3367d6; }
            .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 15px; border-radius: 5px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <h1>🚀 Meeting Bot Automation - Google Auth Test</h1>
        
        <div class="info">
            <h3>📋 Test the Google OAuth Flow</h3>
            <p>Click the button below to test connecting your Google account. This will:</p>
            <ul>
                <li>Redirect you to Google for authorization</li>
                <li>Request access to your Calendar and Gmail</li>
                <li>Save encrypted tokens to the database</li>
                <li>Show your account information</li>
            </ul>
        </div>
        
        <a href="/auth/google" class="button">🔗 Connect Google Account</a>
        
        <h3>📊 Current Status</h3>
        <p><strong>Database:</strong> Connected to MongoDB</p>
        <p><strong>Google OAuth:</strong> Configured ✅</p>
        <p><strong>Redirect URI:</strong> ${process.env.GOOGLE_REDIRECT_URI}</p>
        
        <h3>🧪 Test Endpoints</h3>
        <ul>
            <li><a href="/auth/google">Start Google OAuth</a></li>
            <li><a href="/api/accounts">View Connected Accounts (JSON)</a></li>
            <li><a href="/api/test">API Test</a></li>
        </ul>
    </body>
    </html>
  `);
});

// Start Google OAuth flow
app.get('/auth/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    prompt: 'consent',
    state: 'test-user-' + Date.now()
  });
  
  console.log('🔗 Redirecting to Google OAuth:', authUrl);
  res.redirect(authUrl);
});

// Handle Google OAuth callback
app.get('/api/accounts/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    console.log('📥 Received OAuth callback:', { code: code?.substring(0, 20) + '...', state });
    
    if (!code) {
      return res.status(400).send('❌ No authorization code received');
    }
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log('🔑 Received tokens:', Object.keys(tokens));
    
    // Get user info
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2('v2');
    const userInfo = await oauth2.userinfo.get({ auth: oauth2Client });
    
    console.log('👤 User info:', userInfo.data.email);
    
    // Encrypt and save tokens
    const encryptedTokens = {
      accessToken: crypto.AES.encrypt(tokens.access_token, process.env.ENCRYPTION_KEY).toString(),
      refreshToken: crypto.AES.encrypt(tokens.refresh_token, process.env.ENCRYPTION_KEY).toString(),
      expiryDate: new Date(tokens.expiry_date)
    };
    
    const account = await Account.findOneAndUpdate(
      { email: userInfo.data.email, userId: state },
      {
        email: userInfo.data.email,
        userId: state,
        provider: 'google',
        tokens: encryptedTokens,
        calendarId: 'primary'
      },
      { upsert: true, new: true }
    );
    
    console.log('💾 Account saved:', account._id);
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Authentication Successful</title>
          <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 20px; border-radius: 5px; }
              .button { background: #4285f4; color: white; padding: 10px 20px; border: none; border-radius: 5px; text-decoration: none; display: inline-block; margin: 10px 5px 0 0; }
          </style>
      </head>
      <body>
          <div class="success">
              <h2>✅ Google Account Connected Successfully!</h2>
              <p><strong>Email:</strong> ${userInfo.data.email}</p>
              <p><strong>Account ID:</strong> ${account._id}</p>
              <p><strong>Provider:</strong> ${account.provider}</p>
              <p><strong>Status:</strong> ${account.isActive ? 'Active' : 'Inactive'}</p>
          </div>
          
          <h3>🎉 What happened:</h3>
          <ul>
              <li>✅ Successfully authenticated with Google</li>
              <li>✅ Received access and refresh tokens</li>
              <li>✅ Encrypted and stored tokens in database</li>
              <li>✅ Account is ready for Calendar API access</li>
          </ul>
          
          <a href="/" class="button">🏠 Back to Home</a>
          <a href="/api/accounts" class="button">📊 View All Accounts</a>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('❌ OAuth callback error:', error);
    res.status(500).send(`❌ Authentication failed: ${error.message}`);
  }
});

// API: Get all connected accounts
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

// API: Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    environment: {
      hasGoogleConfig: !!(process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('your-')),
      mongoConnected: mongoose.connection.readyState === 1
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Web Auth Test Server Started!');
  console.log(`📍 Open: http://localhost:${PORT}`);
  console.log(`🔑 Google OAuth: http://localhost:${PORT}/auth/google`);
  console.log(`📊 API Test: http://localhost:${PORT}/api/test`);
  console.log('');
  console.log('✨ Ready to test Google OAuth flow!');
});
