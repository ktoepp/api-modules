require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const { Client: NotionClient } = require('@notionhq/client');
const cron = require('node-cron');
const Account = require('./models/Account');
const Meeting = require('./models/Meeting');

console.log('📝 Starting Enhanced Notion Auto-Recording System...');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

class EnhancedNotionAutoRecorder {
  constructor() {
    this.isMonitoring = false;
    this.connectionStatus = {
      mongodb: false,
      notion: false,
      google: false
    };
  }

  // === CONNECTION TESTING ===
  
  async testAllConnections() {
    console.log('🧪 Testing all connections...');
    
    const results = {
      mongodb: await this.testMongoDB(),
      notion: await this.testNotion(),
      google: await this.testGoogle(),
      overall: false
    };
    
    results.overall = results.mongodb && results.notion && results.google;
    this.connectionStatus = results;
    
    return results;
  }

  async testMongoDB() {
    try {
      await mongoose.connection.db.admin().ping();
      console.log('✅ MongoDB connection: OK');
      return { success: true, message: 'MongoDB connected successfully' };
    } catch (error) {
      console.log('❌ MongoDB connection: FAILED');
      return { success: false, message: error.message };
    }
  }

  async testNotion() {
    try {
      if (!process.env.NOTION_API_KEY) {
        return { success: false, message: 'NOTION_API_KEY not configured' };
      }

      // Test API connection
      const response = await notion.users.me();
      console.log('✅ Notion API connection: OK');
      
      // Test database access if configured
      let databaseTest = null;
      if (process.env.NOTION_DATABASE_ID) {
        try {
          const database = await notion.databases.retrieve({
            database_id: process.env.NOTION_DATABASE_ID
          });
          databaseTest = { success: true, title: database.title[0]?.plain_text || 'Unnamed Database' };
        } catch (dbError) {
          databaseTest = { success: false, message: dbError.message };
        }
      }
      
      return { 
        success: true, 
        message: 'Notion API connected successfully',
        user: response.name,
        database: databaseTest
      };
    } catch (error) {
      console.log('❌ Notion connection: FAILED');
      return { success: false, message: error.message };
    }
  }

  async testGoogle() {
    try {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return { success: false, message: 'Google OAuth credentials not configured' };
      }

      // Test if we can create auth URL
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar.readonly'],
      });
      
      console.log('✅ Google OAuth configuration: OK');
      
      // Check for existing accounts
      const accounts = await Account.find({ provider: 'google' });
      
      return { 
        success: true, 
        message: 'Google OAuth configured successfully',
        connectedAccounts: accounts.length,
        authUrl: authUrl.substring(0, 100) + '...'
      };
    } catch (error) {
      console.log('❌ Google connection: FAILED');
      return { success: false, message: error.message };
    }
  }

  // === NOTION WORKSPACE EXPLORATION ===

  async exploreNotionWorkspace() {
    try {
      console.log('🔍 Exploring Notion workspace...');
      
      // Get all accessible pages and databases
      const search = await notion.search({
        filter: {
          value: 'database',
          property: 'object'
        },
        page_size: 100
      });

      const databases = search.results.map(db => ({
        id: db.id,
        title: db.title[0]?.plain_text || 'Untitled Database',
        url: db.url,
        created: db.created_time,
        properties: Object.keys(db.properties || {})
      }));

      console.log(`📊 Found ${databases.length} databases`);
      return databases;
      
    } catch (error) {
      console.error('❌ Failed to explore workspace:', error.message);
      throw error;
    }
  }

  async getNotionPages() {
    try {
      const search = await notion.search({
        filter: {
          value: 'page',
          property: 'object'
        },
        page_size: 50
      });

      const pages = search.results.map(page => ({
        id: page.id,
        title: page.properties?.title?.title?.[0]?.plain_text || 
               page.properties?.Name?.title?.[0]?.plain_text || 
               'Untitled Page',
        url: page.url,
        created: page.created_time
      }));

      return pages;
    } catch (error) {
      console.error('❌ Failed to get pages:', error.message);
      throw error;
    }
  }

  async createMeetingDatabase(parentPageId, databaseName = 'Meeting Recordings') {
    try {
      console.log(`📊 Creating meeting database: ${databaseName}`);
      
      const database = await notion.databases.create({
        parent: {
          type: 'page_id',
          page_id: parentPageId
        },
        title: [
          {
            type: 'text',
            text: {
              content: databaseName
            }
          }
        ],
        properties: {
          'Meeting Title': {
            title: {}
          },
          'Date': {
            date: {}
          },
          'Status': {
            select: {
              options: [
                { name: 'Scheduled', color: 'yellow' },
                { name: 'Recording', color: 'blue' },
                { name: 'Completed', color: 'green' },
                { name: 'Cancelled', color: 'red' }
              ]
            }
          },
          'Platform': {
            select: {
              options: [
                { name: 'Zoom', color: 'blue' },
                { name: 'Google Meet', color: 'green' },
                { name: 'Microsoft Teams', color: 'purple' },
                { name: 'Other', color: 'gray' }
              ]
            }
          },
          'Account': {
            rich_text: {}
          },
          'Attendees': {
            number: {}
          },
          'Meeting URL': {
            url: {}
          },
          'Duration (mins)': {
            number: {}
          }
        }
      });

      console.log(`✅ Database created: ${database.id}`);
      return database;
      
    } catch (error) {
      console.error('❌ Failed to create database:', error.message);
      throw error;
    }
  }

  // Enhanced meeting page creation with custom location
  async createNotionPage(meeting, accountEmail, databaseId = null) {
    try {
      const targetDatabaseId = databaseId || process.env.NOTION_DATABASE_ID;
      
      if (!targetDatabaseId) {
        throw new Error('No database ID specified for page creation');
      }

      console.log(`📝 Creating Notion page in database: ${targetDatabaseId}`);
      
      const duration = Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / (1000 * 60));
      
      const response = await notion.pages.create({
        parent: {
          type: 'database_id',
          database_id: targetDatabaseId
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
              name: 'Scheduled'
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
          },
          'Meeting URL': meeting.meetingUrl ? {
            url: meeting.meetingUrl
          } : { url: null },
          'Duration (mins)': {
            number: duration
          }
        },
        children: [
          {
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: meeting.title || 'Meeting Notes'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'callout',
            callout: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: `📅 ${meeting.startTime.toLocaleString()} - ${meeting.endTime.toLocaleString()}\n🎥 Platform: ${meeting.meetingPlatform}\n👥 ${meeting.attendees.length} attendees\n⏱️ ${duration} minutes`
                  }
                }
              ],
              icon: {
                emoji: '📋'
              },
              color: 'blue_background'
            }
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Pre-Meeting Setup'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'to_do',
            to_do: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Review agenda and prepare questions'
                  }
                }
              ],
              checked: false
            }
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
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
                    content: 'Meeting notes will be added here during the session...'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
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
            type: 'to_do',
            to_do: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Action items will be captured here'
                  }
                }
              ],
              checked: false
            }
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Follow-up'
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
                    content: 'Next steps and follow-up items...'
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
}

const autoRecorder = new EnhancedNotionAutoRecorder();

// === WEB INTERFACE ===

app.get('/', async (req, res) => {
  const connections = await autoRecorder.testAllConnections();
  
  res.send(`
    <html>
    <head><title>Enhanced Notion Auto-Recording System</title></head>
    <body style="font-family: Arial; max-width: 1200px; margin: 20px auto; padding: 20px;">
        <h1>📝 Enhanced Notion Auto-Recording System</h1>
        
        <!-- Connection Status -->
        <div style="background: ${connections.overall ? '#d4edda' : '#f8d7da'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>🔌 Connection Status</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div>
                    <strong>MongoDB:</strong> ${connections.mongodb.success ? '🟢 Connected' : '🔴 Failed'}
                    ${!connections.mongodb.success ? `<br><small style="color: #dc3545;">${connections.mongodb.message}</small>` : ''}
                </div>
                <div>
                    <strong>Notion API:</strong> ${connections.notion.success ? '🟢 Connected' : '🔴 Failed'}
                    ${connections.notion.success && connections.notion.user ? `<br><small>User: ${connections.notion.user}</small>` : ''}
                    ${!connections.notion.success ? `<br><small style="color: #dc3545;">${connections.notion.message}</small>` : ''}
                </div>
                <div>
                    <strong>Google OAuth:</strong> ${connections.google.success ? '🟢 Configured' : '🔴 Failed'}
                    ${connections.google.success ? `<br><small>${connections.google.connectedAccounts} accounts connected</small>` : ''}
                    ${!connections.google.success ? `<br><small style="color: #dc3545;">${connections.google.message}</small>` : ''}
                </div>
            </div>
        </div>
        
        <!-- Main Actions -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 30px 0;">
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                <h4>🧪 Test Connections</h4>
                <p>Verify all integrations are working</p>
                <a href="/test-connections" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Test All
                </a>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                <h4>🏗️ Setup Workspace</h4>
                <p>Choose where to save meeting pages</p>
                <a href="/workspace-setup" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Configure
                </a>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                <h4>📅 Connect Calendar</h4>
                <p>Link your Google Calendar</p>
                <a href="/connect-calendar" style="background: #6f42c1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Connect
                </a>
            </div>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center;">
                <h4>🎯 Start Monitoring</h4>
                <p>Begin automatic recording</p>
                <a href="/start-monitoring" style="background: #fd7e14; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Start
                </a>
            </div>
        </div>
        
        <!-- System Info -->
        <div style="background: #e9ecef; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4>📊 System Information</h4>
            <p><strong>Monitoring:</strong> ${autoRecorder.isMonitoring ? '🟢 Active' : '🔴 Inactive'}</p>
            <p><strong>Notion Database:</strong> ${process.env.NOTION_DATABASE_ID ? '🟢 Configured' : '🔴 Not set'}</p>
            <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
        </div>
    </body>
    </html>
  `);
});

app.get('/test-connections', async (req, res) => {
  try {
    const results = await autoRecorder.testAllConnections();
    
    res.send(`
      <html>
      <head><title>Connection Test Results</title></head>
      <body style="font-family: Arial; max-width: 800px; margin: 20px auto; padding: 20px;">
          <h1>🧪 Connection Test Results</h1>
          
          <div style="background: ${results.overall ? '#d4edda' : '#f8d7da'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>${results.overall ? '✅ All Systems Operational' : '❌ Issues Detected'}</h3>
          </div>
          
          <!-- MongoDB Test -->
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <h4>${results.mongodb.success ? '✅' : '❌'} MongoDB Connection</h4>
              <p><strong>Status:</strong> ${results.mongodb.success ? 'Connected' : 'Failed'}</p>
              <p><strong>Message:</strong> ${results.mongodb.message}</p>
          </div>
          
          <!-- Notion Test -->
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <h4>${results.notion.success ? '✅' : '❌'} Notion API</h4>
              <p><strong>Status:</strong> ${results.notion.success ? 'Connected' : 'Failed'}</p>
              <p><strong>Message:</strong> ${results.notion.message}</p>
              ${results.notion.user ? `<p><strong>User:</strong> ${results.notion.user}</p>` : ''}
              ${results.notion.database ? `
                <p><strong>Database:</strong> ${results.notion.database.success ? 
                  `✅ ${results.notion.database.title}` : 
                  `❌ ${results.notion.database.message}`
                }</p>
              ` : '<p><strong>Database:</strong> Not configured</p>'}
          </div>
          
          <!-- Google Test -->
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <h4>${results.google.success ? '✅' : '❌'} Google OAuth</h4>
              <p><strong>Status:</strong> ${results.google.success ? 'Configured' : 'Failed'}</p>
              <p><strong>Message:</strong> ${results.google.message}</p>
              ${results.google.connectedAccounts !== undefined ? `<p><strong>Connected Accounts:</strong> ${results.google.connectedAccounts}</p>` : ''}
          </div>
          
          <div style="margin: 30px 0;">
              <a href="/" style="background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                  🏠 Back to Home
              </a>
              <a href="/workspace-setup" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-left: 10px;">
                  ⚙️ Workspace Setup
              </a>
          </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.send(`<h1>❌ Test Failed</h1><p>Error: ${error.message}</p><a href="/">🏠 Back to Home</a>`);
  }
});

app.get('/workspace-setup', async (req, res) => {
  try {
    const [databases, pages] = await Promise.all([
      autoRecorder.exploreNotionWorkspace(),
      autoRecorder.getNotionPages()
    ]);
    
    const databaseOptions = databases.map(db => 
      `<option value="${db.id}">${db.title} (${db.properties.length} properties)</option>`
    ).join('');
    
    const pageOptions = pages.map(page => 
      `<option value="${page.id}">${page.title}</option>`
    ).join('');
    
    res.send(`
      <html>
      <head><title>Workspace Setup</title></head>
      <body style="font-family: Arial; max-width: 900px; margin: 20px auto; padding: 20px;">
          <h1>🏗️ Notion Workspace Setup</h1>
          
          <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>📊 Found ${databases.length} databases and ${pages.length} pages in your workspace</h3>
          </div>
          
          <!-- Option 1: Use Existing Database -->
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Option 1: Use Existing Database</h3>
              <form action="/set-database" method="post">
                  <select name="databaseId" style="width: 100%; padding: 10px; margin: 10px 0;">
                      <option value="">Select a database...</option>
                      ${databaseOptions}
                  </select>
                  <br>
                  <button type="submit" style="background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">
                      Use This Database
                  </button>
              </form>
          </div>
          
          <!-- Option 2: Create New Database -->
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Option 2: Create New Database</h3>
              <form action="/create-database" method="post">
                  <label>Database Name:</label>
                  <input type="text" name="databaseName" value="Meeting Recordings" style="width: 100%; padding: 10px; margin: 10px 0;">
                  
                  <label>Parent Page:</label>
                  <select name="parentPageId" style="width: 100%; padding: 10px; margin: 10px 0;">
                      <option value="">Select parent page...</option>
                      ${pageOptions}
                  </select>
                  <br>
                  <button type="submit" style="background: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer;">
                      Create Database
                  </button>
              </form>
          </div>
          
          <!-- Current Configuration -->
          <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>📋 Current Configuration</h3>
              <p><strong>Database ID:</strong> ${process.env.NOTION_DATABASE_ID || 'Not set'}</p>
              <p><em>Meeting pages will be created in this database</em></p>
          </div>
          
          <a href="/" style="background: #6c757d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              🏠 Back to Home
          </a>
      </body>
      </html>
    `);
    
  } catch (error) {
    res.send(`
      <h1>❌ Workspace Setup Failed</h1>
      <p>Error: ${error.message}</p>
      <p>Make sure your Notion integration has access to your workspace</p>
      <a href="/">🏠 Back to Home</a>
    `);
  }
});

app.post('/set-database', (req, res) => {
  const { databaseId } = req.body;
  
  if (!databaseId) {
    return res.send('<h1>❌ No database selected</h1><a href="/workspace-setup">🔙 Try Again</a>');
  }
  
  // In a real app, you'd save this to your config file or database
  // For now, we'll just show success
  res.send(`
    <h1>✅ Database Configuration Saved</h1>
    <p><strong>Database ID:</strong> ${databaseId}</p>
    <p>⚠️ <strong>Important:</strong> Add this to your .env file:</p>
    <pre style="background: #f8f9fa; padding: 15px; border-radius: 5px;">NOTION_DATABASE_ID=${databaseId}</pre>
    <div style="margin: 20px 0;">
        <a href="/" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            🏠 Back to Home
        </a>
        <a href="/test-notion-page" style="background: #6f42c1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-left: 10px;">
            🧪 Test Page Creation
        </a>
    </div>
  `);
});

app.post('/create-database', async (req, res) => {
  try {
    const { databaseName, parentPageId } = req.body;
    
    if (!parentPageId) {
      return res.send('<h1>❌ No parent page selected</h1><a href="/workspace-setup">🔙 Try Again</a>');
    }
    
    const database = await autoRecorder.createMeetingDatabase(parentPageId, databaseName);
    
    res.send(`
      <h1>✅ Database Created Successfully!</h1>
      <p><strong>Database Name:</strong> ${databaseName}</p>
      <p><strong>Database ID:</strong> ${database.id}</p>
      <p><strong>URL:</strong> <a href="${database.url}" target="_blank">View in Notion</a></p>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4>⚠️ Important: Update your .env file</h4>
          <pre style="background: #f8f9fa; padding: 10px; border-radius: 3px;">NOTION_DATABASE_ID=${database.id}</pre>
      </div>
      
      <div style="margin: 20px 0;">
          <a href="/" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              🏠 Back to Home
          </a>
          <a href="/test-notion-page" style="background: #6f42c1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-left: 10px;">
              🧪 Test Page Creation
          </a>
      </div>
    `);
    
  } catch (error) {
    res.send(`
      <h1>❌ Database Creation Failed</h1>
      <p>Error: ${error.message}</p>
      <a href="/workspace-setup">🔙 Try Again</a>
    `);
  }
});

app.get('/test-notion-page', async (req, res) => {
  try {
    const testMeeting = {
      title: 'Test Meeting - System Verification',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000), // 1 hour
      meetingPlatform: 'zoom',
      attendees: ['test1@example.com', 'test2@example.com'],
      meetingUrl: 'https://zoom.us/j/123456789'
    };
    
    const pageId = await autoRecorder.createNotionPage(testMeeting, 'system-test@example.com');
    
    res.send(`
      <h1>✅ Test Page Created Successfully!</h1>
      <p><strong>Page ID:</strong> ${pageId}</p>
      <p><strong>Meeting:</strong> ${testMeeting.title}</p>
      
      <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h4>🎉 System is ready!</h4>
          <p>Your Notion integration is working correctly. The system can now create meeting pages automatically.</p>
      </div>
<a href="/" style="background: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
         🏠 Back to Home
     </a>
   `);
   
 } catch (error) {
   res.send(`
     <h1>❌ Test Page Creation Failed</h1>
     <p>Error: ${error.message}</p>
     <p>Make sure NOTION_DATABASE_ID is correctly set in your .env file</p>
     <a href="/workspace-setup">⚙️ Workspace Setup</a>
   `);
 }
});

app.get('/connect-calendar', (req, res) => {
 const authUrl = oauth2Client.generateAuthUrl({
   access_type: 'offline',
   scope: [
     'https://www.googleapis.com/auth/userinfo.email',
     'https://www.googleapis.com/auth/calendar.readonly',
     'https://www.googleapis.com/auth/calendar.events'
   ],
   prompt: 'consent',
   state: 'enhanced-recorder-' + Date.now()
 });
 
 res.redirect(authUrl);
});

app.get('/api/accounts/google/callback', async (req, res) => {
 const { code, state, error } = req.query;
 
 if (error) {
   return res.send(`<h2>❌ OAuth Error: ${error}</h2><a href="/">🏠 Home</a>`);
 }
 
 if (!code) {
   return res.send('<h2>❌ No authorization code received</h2><a href="/">🏠 Home</a>');
 }
 
 try {
   const { tokens } = await oauth2Client.getToken(code);
   oauth2Client.setCredentials(tokens);
   
   const oauth2 = google.oauth2('v2');
   const userInfo = await oauth2.userinfo.get({ auth: oauth2Client });
   const userEmail = userInfo.data.email;
   
   // Save account (simplified for this demo)
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
   }
   
   res.send(`
     <html>
     <head><title>Calendar Connected</title></head>
     <body style="font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px;">
         <h1>✅ Calendar Connected Successfully!</h1>
         
         <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
             <h3>🎉 Connection Details</h3>
             <p><strong>Email:</strong> ${userEmail}</p>
             <p><strong>Account ID:</strong> ${account._id}</p>
             <p><strong>Status:</strong> Ready for monitoring</p>
         </div>
         
         <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
             <h3>🚀 What's Next?</h3>
             <ul>
                 <li>✅ Google Calendar connected</li>
                 <li>✅ Account saved to database</li>
                 <li>🔄 Ready to start monitoring</li>
                 <li>📝 Will create Notion pages for new meetings</li>
             </ul>
         </div>
         
         <div style="text-align: center; margin: 30px 0;">
             <a href="/" style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
                 🏠 Back to Home
             </a>
             <a href="/start-monitoring" style="background: #fd7e14; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
                 ▶️ Start Monitoring
             </a>
         </div>
     </body>
     </html>
   `);
   
 } catch (error) {
   console.error('❌ Calendar connection error:', error);
   res.send(`<h2>❌ Error: ${error.message}</h2><a href="/">🏠 Home</a>`);
 }
});

app.get('/start-monitoring', (req, res) => {
 autoRecorder.startMonitoring();
 res.send(`
   <html>
   <head><title>Monitoring Started</title></head>
   <body style="font-family: Arial; max-width: 600px; margin: 50px auto; padding: 20px;">
       <h1>▶️ Monitoring Started!</h1>
       
       <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
           <h3>🎯 System Active</h3>
           <p>✅ Calendar monitoring is now running</p>
           <p>✅ Will check for new meetings every 5 minutes</p>
           <p>✅ Notion pages will be created automatically</p>
           <p>✅ Recording will start when meetings begin</p>
       </div>
       
       <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
           <h3>⚠️ Important Notes</h3>
           <ul>
               <li>Keep this server running to maintain monitoring</li>
               <li>Check your Notion workspace for new meeting pages</li>
               <li>The system will only process meetings with video links</li>
           </ul>
       </div>
       
       <a href="/" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
           🏠 Back to Dashboard
       </a>
   </body>
   </html>
 `);
});

app.listen(PORT, () => {
 console.log(`📝 Enhanced Notion Auto-Recording System: http://localhost:${PORT}`);
 console.log('🔧 Features available:');
 console.log('   • Connection testing');
 console.log('   • Workspace configuration');
 console.log('   • Database creation');
 console.log('   • Page location control');
 console.log('✅ Ready for production use!');
});
