require('dotenv').config();
const GoogleAuthService = require('./services/integrations/google/authService');

async function testGoogleAuth() {
  try {
    console.log('🧪 Testing Google Auth setup...');
    
    // Check environment variables
    const requiredEnvs = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ENCRYPTION_KEY'];
    const missing = requiredEnvs.filter(env => 
      !process.env[env] || process.env[env].includes('your-')
    );
    
    if (missing.length > 0) {
      console.log('❌ Missing/unconfigured environment variables:');
      missing.forEach(env => console.log(`   - ${env}`));
      console.log('\n💡 These need to be configured in your .env file');
      console.log('📋 Steps to configure Google OAuth:');
      console.log('1. Go to https://console.cloud.google.com/');
      console.log('2. Create/select a project');
      console.log('3. Enable Google Calendar API and Gmail API');
      console.log('4. Create OAuth 2.0 credentials');
      console.log('5. Add redirect URI: http://localhost:3000/api/accounts/google/callback');
      console.log('6. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
      return;
    }
    
    const googleAuth = new GoogleAuthService();
    await googleAuth.initialize();
    
    // Generate a test auth URL
    const authUrl = googleAuth.getAuthUrl('test-user');
    console.log('✅ Google Auth service initialized successfully!');
    console.log('🔗 Test auth URL generated:', authUrl.substring(0, 80) + '...');
    console.log('\n✅ Google integration is ready to use!');
    
  } catch (error) {
    console.error('❌ Google Auth test failed:', error.message);
    if (error.message.includes('redirect_uri_mismatch')) {
      console.log('💡 Make sure to add this redirect URI in Google Cloud Console:');
      console.log('   http://localhost:3000/api/accounts/google/callback');
    }
  }
}

testGoogleAuth();
