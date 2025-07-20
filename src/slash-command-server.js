require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// Helper: Validate Slack request
function isValidSlackRequest(req) {
  const slackSecret = process.env.SLACK_SIGNING_SECRET;
  
  if (!slackSecret) {
    console.warn('SLACK_SIGNING_SECRET not configured - skipping signature validation');
    return true;
  }
  
  const timestamp = req.headers['x-slack-request-timestamp'];
  const sig = req.headers['x-slack-signature'];
  
  if (!timestamp || !sig) {
    console.error('Missing Slack headers:', { timestamp: !!timestamp, signature: !!sig });
    return false;
  }
  
  // Check if request is too old (replay attack protection)
  if (Math.abs(Date.now() / 1000 - timestamp) > 60 * 5) {
    console.error('Request too old:', { timestamp, current: Date.now() / 1000 });
    return false;
  }
  
  const hmac = crypto.createHmac('sha256', slackSecret);
  const [version, hash] = sig.split('=');
  const baseString = `${version}:${timestamp}:${new URLSearchParams(req.body).toString()}`;
  hmac.update(baseString);
  const mySig = `${version}=` + hmac.digest('hex');
  
  const isValid = crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(sig));
  if (!isValid) {
    console.error('Invalid signature:', { expected: mySig, received: sig });
  }
  
  return isValid;
}

// Helper: Generate a title from message content
function generateTitle(message) {
  // Remove extra whitespace and get first few words
  const cleanMessage = message.trim();
  
  // If message is short (less than 50 chars), use it as is
  if (cleanMessage.length <= 50) {
    return cleanMessage;
  }
  
  // Take first 3-5 words and add ellipsis
  const words = cleanMessage.split(' ').slice(0, 4);
  const title = words.join(' ');
  
  // Add ellipsis if we truncated
  return words.length >= 4 && cleanMessage.length > title.length ? `${title}...` : title;
}

// Helper: Add message to Notion database
async function addMessageToNotionDatabase(message, userId, userName) {
  try {
    console.log(`[SLASH] Adding message to Notion database: ${message}`);
    
    // Format the message with timestamp
    const now = new Date();
    const formattedTimestamp = now.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    // Generate a title from the message content
    const generatedTitle = generateTitle(message);
    
    // Create new database entry
    const newEntry = {
      parent: {
        database_id: databaseId
      },
      properties: {
        // Title property (required) - use generated title
        'title': {
          title: [
            {
              text: {
                content: generatedTitle
              }
            }
          ]
        },
        // Content property
        'Content': {
          rich_text: [
            {
              text: {
                content: message
              }
            }
          ]
        },
        // Date property
        'Date': {
          date: {
            start: now.toISOString()
          }
        }
      }
    };
    
    // Add the new entry to the database
    const createdPage = await notion.pages.create(newEntry);
    
    console.log(`[SLASH] Successfully added message to Notion database`);
    return { 
      success: true, 
      timestamp: formattedTimestamp,
      pageId: createdPage.id,
      pageUrl: `https://www.notion.so/${createdPage.id.replace(/-/g, '')}`
    };
    
  } catch (error) {
    console.error('[SLASH] Error adding message to Notion database:', error);
    throw error;
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Slack Slash Command Server',
    status: 'running',
    endpoints: {
      slashCommand: '/api/slash-command',
      test: '/api/test-slash',
      health: '/health'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: {
      notionApiKey: !!process.env.NOTION_API_KEY,
      notionDatabaseId: !!process.env.NOTION_DATABASE_ID,
      slackSigningSecret: !!process.env.SLACK_SIGNING_SECRET
    }
  });
});

// OAuth callback endpoint
app.get('/api/oauth/callback', (req, res) => {
  console.log('[OAUTH] OAuth callback received');
  res.json({ 
    message: 'OAuth callback endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

// Add the /oauth/callback endpoint that Slack expects
app.get('/oauth/callback', (req, res) => {
  console.log('[OAUTH] OAuth callback received at /oauth/callback');
  res.json({ 
    message: 'OAuth callback endpoint is working!',
    timestamp: new Date().toISOString()
  });
});

// Slash command handler function
async function handleSlashCommand(req, res) {
  try {
    // Validate Slack signature (skip for URL verification)
    // Temporarily disabled for testing
    // if (!isValidSlackRequest(req)) {
    //   console.error('Invalid Slack request signature');
    //   return res.status(401).json({ error: 'Invalid request signature' });
    // }
    
    // Parse form data (Slack sends slash commands as form data)
    const body = req.body;
    console.log('[SLASH] Request body:', body);
    
    // Handle different types of Slack requests
    if (body.type === 'event_callback') {
      console.log('[SLASH] Ignoring event callback (not a slash command)');
      return res.status(200).json({ ok: true });
    }
    
    // Extract command data
    const command = body.command;
    const text = body.text;
    const userId = body.user_id;
    const userName = body.user_name;
    const timestamp = body.timestamp;
    
    // Verify this is the /ntn command
    if (!command || command !== '/ntn') {
      console.log(`[SLASH] Ignored command: ${command}`);
      return res.status(200).json({ 
        response_type: 'ephemeral',
        text: 'This endpoint only handles the /ntn command'
      });
    }
    
    // Check if message is provided
    if (!text || text.trim() === '') {
      return res.status(200).json({
        response_type: 'ephemeral',
        text: 'Please provide a message to add to Notion. Usage: `/ntn your message here`'
      });
    }
    
    // Add message to Notion database
    const result = await addMessageToNotionDatabase(text.trim(), userId, userName);
    
    // Return success response to Slack
    return res.status(200).json({
      response_type: 'in_channel',
      text: `✅ Message added to Notion: "${text.trim()}"`,
      attachments: [
        {
          text: `Added by @${userName} at ${result.timestamp} | <${result.pageUrl}|View in Notion>`,
          color: 'good'
        }
      ]
    });
    
  } catch (error) {
    console.error('[SLASH] Error processing slash command:', error);
    
    // Return error response to Slack
    return res.status(200).json({
      response_type: 'ephemeral',
      text: '❌ Failed to add message to Notion. Please try again later.',
      attachments: [
        {
          text: `Error: ${error.message}`,
          color: 'danger'
        }
      ]
    });
  }
}

// Add the /slack/events endpoint that Slack expects
app.post('/slack/events', async (req, res) => {
  console.log('[SLACK-EVENTS] Received request');
  
  // Handle Slack URL verification challenge
  if (req.body && req.body.type === 'url_verification') {
    console.log('[SLACK-EVENTS] Handling URL verification challenge');
    return res.status(200).json({ challenge: req.body.challenge });
  }
  
  // For slash commands, redirect to the main handler
  return handleSlashCommand(req, res);
});

app.post('/api/slash-command', async (req, res) => {
  console.log('[SLASH] Received request');
  
  // Handle Slack URL verification challenge
  if (req.body && req.body.type === 'url_verification') {
    console.log('[SLASH] Handling URL verification challenge');
    return res.status(200).json({ challenge: req.body.challenge });
  }
  
  return handleSlashCommand(req, res);
});

app.get('/api/test-slash', async (req, res) => {
  console.log('[TEST-SLASH] Testing slash command setup');
  
  try {
    // Test 1: Check environment variables
    const envCheck = {
      NOTION_API_KEY: !!process.env.NOTION_API_KEY,
      NOTION_DATABASE_ID: !!process.env.NOTION_DATABASE_ID,
      SLACK_SIGNING_SECRET: !!process.env.SLACK_SIGNING_SECRET
    };
    
    // Test 2: Test Notion database connection
    let notionTest = { success: false, error: null };
    try {
      const database = await notion.databases.retrieve({ database_id: databaseId });
      notionTest = { 
        success: true, 
        databaseTitle: database.title?.[0]?.text?.content || 'Untitled',
        databaseUrl: `https://www.notion.so/${databaseId}`
      };
    } catch (error) {
      notionTest = { success: false, error: error.message };
    }
    
    // Test 3: Test adding a message (if Notion connection works)
    let messageTest = { success: false, error: null };
    if (notionTest.success) {
      try {
        const testMessage = `🧪 Test message from local server at ${new Date().toLocaleString()}`;
        
        const newEntry = {
          parent: {
            database_id: databaseId
          },
          properties: {
            'title': {
              title: [
                {
                  text: {
                    content: generateTitle(testMessage)
                  }
                }
              ]
            },
            'Content': {
              rich_text: [
                {
                  text: {
                    content: testMessage
                  }
                }
              ]
            },
            'Date': {
              date: {
                start: new Date().toISOString()
              }
            }
          }
        };
        
        await notion.pages.create(newEntry);
        
        messageTest = { success: true, message: testMessage };
      } catch (error) {
        messageTest = { success: false, error: error.message };
      }
    }
    
    // Return comprehensive test results
    return res.status(200).json({
      timestamp: new Date().toISOString(),
      environment: envCheck,
      notionConnection: notionTest,
      messageTest: messageTest,
      setupInstructions: {
        slackApp: 'Create a Slack app and add a slash command /ntn pointing to this endpoint',
        notionPage: 'Create a Notion page and share it with your integration',
        environmentVariables: {
          NOTION_API_KEY: 'Your Notion integration API key',
          NOTION_PAGE_ID: 'The ID of the page where messages will be added',
          SLACK_SIGNING_SECRET: 'Your Slack app signing secret'
        }
      }
    });
    
  } catch (error) {
    console.error('[TEST-SLASH] Error:', error);
    return res.status(500).json({
      error: 'Test failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Slack Slash Command Server running on port ${port}`);
  console.log(`📝 Slash command endpoint: http://localhost:${port}/api/slash-command`);
  console.log(`🧪 Test endpoint: http://localhost:${port}/api/test-slash`);
  console.log(`💚 Health check: http://localhost:${port}/health`);
  
  // Check environment variables
  console.log('\n🔍 Environment Check:');
  console.log('NOTION_API_KEY:', process.env.NOTION_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('NOTION_DATABASE_ID:', process.env.NOTION_DATABASE_ID ? '✅ Set' : '❌ Missing');
  console.log('SLACK_SIGNING_SECRET:', process.env.SLACK_SIGNING_SECRET ? '✅ Set' : '❌ Missing');
  
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    console.log('\n⚠️  Missing required environment variables!');
    console.log('Please set NOTION_API_KEY and NOTION_DATABASE_ID in your .env file');
  }
});

module.exports = app; 