require('dotenv').config();
const mongoose = require('mongoose');
const Account = require('./models/Account');
const Meeting = require('./models/Meeting');
const Rule = require('./models/Rule');
const logger = require('./services/utils/logger');

async function testModels() {
  try {
    console.log('🧪 Testing database models...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
    
    // Test Account model
    const testAccount = new Account({
      userId: 'test-user-123',
      email: 'test@example.com',
      provider: 'google',
      tokens: {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiryDate: new Date(Date.now() + 3600000)
      },
      calendarId: 'primary'
    });
    
    await testAccount.validate();
    logger.info('✅ Account model validation passed');
    
    // Test Rule model
    const testRule = new Rule({
      name: 'Test Rule',
      description: 'A test rule',
      conditions: {
        minDuration: 30,
        titleKeywords: ['standup', 'meeting']
      },
      actions: {
        inviteBot: true
      }
    });
    
    await testRule.validate();
    logger.info('✅ Rule model validation passed');
    
    // Test Meeting model
    const testMeeting = new Meeting({
      accountId: testAccount._id, // Use the test account ID
      googleEventId: 'test-event-123',
      title: 'Test Meeting',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000), // 1 hour later
      attendees: ['user1@example.com', 'user2@example.com'],
      meetingPlatform: 'zoom'
    });
    
    await testMeeting.validate();
    logger.info('✅ Meeting model validation passed');
    
    await mongoose.disconnect();
    logger.info('✅ All models working correctly!');
    
  } catch (error) {
    console.error('❌ Model test failed:', error.message);
    process.exit(1);
  }
}

testModels();
