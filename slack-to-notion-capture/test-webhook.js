const crypto = require('crypto');

// Test function to simulate Slack webhook
async function testSlackWebhook() {
  const webhookUrl = 'http://localhost:3000/api/webhook'; // Change this to your deployed URL
  const testMessage = 'This is a test message with urgent newsreel content';
  
  // Create a mock Slack event
  const slackEvent = {
    token: 'test-token',
    team_id: 'T123456',
    api_app_id: 'A123456',
    event: {
      type: 'message',
      channel: 'C123456',
      user: 'U123456',
      text: testMessage,
      ts: '1234567890.123456',
      event_ts: '1234567890.123456',
      channel_type: 'channel'
    },
    type: 'event_callback',
    event_id: 'Ev123456',
    event_time: Math.floor(Date.now() / 1000)
  };

  // Create signature (if you have a secret)
  const secret = process.env.SLACK_WEBHOOK_SECRET || 'your-slack-signing-secret-here';
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(slackEvent);
  
  const hmac = crypto.createHmac('sha256', secret);
  const baseString = `v0:${timestamp}:${body}`;
  hmac.update(baseString);
  const signature = `v0=${hmac.digest('hex')}`;

  const headers = {
    'Content-Type': 'application/json',
    'X-Slack-Request-Timestamp': timestamp,
    'X-Slack-Signature': signature
  };

  try {
    console.log('Testing webhook with message:', testMessage);
    console.log('Headers:', headers);
    console.log('Body:', body);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body
    });

    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Response body:', result);
    
    if (response.ok) {
      console.log('✅ Webhook test successful!');
    } else {
      console.log('❌ Webhook test failed');
    }
    
  } catch (error) {
    console.error('❌ Error testing webhook:', error.message);
  }
}

// Test Notion connection directly
async function testNotionConnection() {
  const { Client } = require('@notionhq/client');
  
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    console.log('❌ Missing Notion environment variables');
    return;
  }

  try {
    const notion = new Client({ auth: process.env.NOTION_API_KEY });
    
    // Test database access
    const database = await notion.databases.retrieve({
      database_id: process.env.NOTION_DATABASE_ID
    });
    
    console.log('✅ Notion database accessible');
    console.log('Database title:', database.title[0]?.plain_text);
    console.log('Available properties:', Object.keys(database.properties));
    
    // Log property types
    console.log('Property types:');
    Object.entries(database.properties).forEach(([key, value]) => {
      console.log(`  ${key}: ${value.type}`);
    });
    
    // Test creating a minimal page with only required properties
    const testPage = await notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        'Meeting Title': {
          title: [{ text: { content: 'Test Page from Script' } }]
        },
        'Notes': {
          rich_text: [{ text: { content: 'This is a test page created by the test script' } }]
        },
        'Date': {
          date: { start: new Date().toISOString() }
        }
      }
    });
    
    console.log('✅ Test page created successfully');
    console.log('Page ID:', testPage.id);
    console.log('Page URL:', testPage.url);
    
  } catch (error) {
    console.error('❌ Notion test failed:', error.message);
  }
}

// Run tests
async function runTests() {
  console.log('🧪 Running webhook tests...\n');
  
  console.log('1. Testing Notion connection...');
  await testNotionConnection();
  
  console.log('\n2. Testing Slack webhook...');
  await testSlackWebhook();
}

// Load environment variables
require('dotenv').config();

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testSlackWebhook, testNotionConnection }; 