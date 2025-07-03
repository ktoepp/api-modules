require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const { Client: NotionClient } = require('@notionhq/client');
const cron = require('node-cron');
const Account = require('./models/Account');
const Meeting = require('./models/Meeting');

console.log('📝 Starting Fixed Notion Auto-Recording System...');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGODB_URI);

const notion = new NotionClient({
  auth: process.env.NOTION_API_KEY,
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/accounts/google/callback'
);

class FixedNotionAutoRecorder {
  constructor() {
    this.isMonitoring = false;
  }

  // Get database schema to understand what properties exist
  async getDatabaseSchema(databaseId) {
    try {
      const database = await notion.databases.retrieve({
        database_id: databaseId
      });
      
      console.log('📊 Database properties:');
      const properties = {};
      
      Object.entries(database.properties).forEach(([name, prop]) => {
        console.log(`  - ${name}: ${prop.type}`);
        properties[name] = prop.type;
      });
      
      return properties;
    } catch (error) {
      console.error('❌ Failed to get database schema:', error.message);
      throw error;
    }
  }

  // Create Notion page with flexible property mapping
  async createNotionPage(meeting, accountEmail, databaseId = null) {
    try {
      const targetDatabaseId = databaseId || process.env.NOTION_DATABASE_ID;
      
      if (!targetDatabaseId) {
        throw new Error('No database ID specified for page creation');
      }

      console.log(`📝 Creating Notion page in database: ${targetDatabaseId}`);
      
      // Get database schema first
      const schema = await this.getDatabaseSchema(targetDatabaseId);
      
      const duration = Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / (1000 * 60));
      
      // Build properties based on what exists in the database
      const properties = {};
      
      // Title property (required)
      if (schema['Meeting Title']) {
        properties['Meeting Title'] = {
          title: [{ text: { content: meeting.title || 'Untitled Meeting' } }]
        };
      } else if (schema['Name']) {
        properties['Name'] = {
          title: [{ text: { content: meeting.title || 'Untitled Meeting' } }]
        };
      } else if (schema['Title']) {
        properties['Title'] = {
          title: [{ text: { content: meeting.title || 'Untitled Meeting' } }]
        };
      }
      
      // Date property
      if (schema['Date']) {
        properties['Date'] = {
          date: {
            start: meeting.startTime.toISOString(),
            end: meeting.endTime.toISOString()
          }
        };
      }
      
      // Status property (select)
      if (schema['Status'] === 'select') {
        properties['Status'] = {
          select: { name: 'Scheduled' }
        };
      }
      
      // Platform property (select)
      if (schema['Platform'] === 'select') {
        properties['Platform'] = {
          select: { name: meeting.meetingPlatform || 'Other' }
        };
      }
      
      // Account property (text)
      if (schema['Account'] === 'rich_text') {
        properties['Account'] = {
          rich_text: [{ text: { content: accountEmail } }]
        };
      }
      
      // Attendees property - handle different types
      if (schema['Attendees'] === 'number') {
        properties['Attendees'] = {
          number: meeting.attendees.length
        };
      } else if (schema['Attendees'] === 'rich_text') {
        properties['Attendees'] = {
          rich_text: [{ text: { content: `${meeting.attendees.length} attendees` } }]
        };
      } else if (schema['Attendees'] === 'people') {
        // For people property, we can't add arbitrary emails
        // Skip this property or use a different approach
        console.log('⚠️ Skipping Attendees property (people type not supported with external emails)');
      }
      
      // Meeting URL property
      if (schema['Meeting URL'] === 'url' && meeting.meetingUrl) {
        properties['Meeting URL'] = {
          url: meeting.meetingUrl
        };
      }
      
      // Duration property
      if (schema['Duration (mins)'] === 'number') {
        properties['Duration (mins)'] = {
          number: duration
        };
      } else if (schema['Duration'] === 'number') {
        properties['Duration'] = {
          number: duration
        };
      }
      
      console.log('📝 Creating page with properties:', Object.keys(properties));
      
      const response = await notion.pages.create({
        parent: {
          type: 'database_id',
          database_id: targetDatabaseId
        },
        properties,
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
                    content: `📅 ${meeting.startTime.toLocaleString()} - ${meeting.endTime.toLocaleString()}\n�� Platform: ${meeting.meetingPlatform}\n👥 ${meeting.attendees.length} attendees\n⏱️ ${duration} minutes`
                  }
                }
              ],
              icon: { emoji: '📋' },
              color: 'blue_background'
            }
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [{ type: 'text', text: { content: 'Meeting Notes' } }]
            }
          },
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: 'Meeting notes will be added here during the session...' }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [{ type: 'text', text: { content: 'Action Items' } }]
            }
          },
          {
            object: 'block',
            type: 'to_do',
            to_do: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: 'Action items will be captured here' }
                }
              ],
              checked: false
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

  async testAllConnections() {
    const results = {
      mongodb: await this.testMongoDB(),
      notion: await this.testNotion(),
      google: await this.testGoogle(),
      overall: false
    };
    
    results.overall = results.mongodb && results.notion && results.google;
    return results;
  }

  async testMongoDB() {
    try {
      await mongoose.connection.db.admin().ping();
      return { success: true, message: 'MongoDB connected successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async testNotion() {
    try {
      if (!process.env.NOTION_API_KEY) {
        return { success: false, message: 'NOTION_API_KEY not configured' };
      }

      const response = await notion.users.me();
      
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
      return { success: false, message: error.message };
    }
  }

  async testGoogle() {
    try {
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return { success: false, message: 'Google OAuth credentials not configured' };
      }

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar.readonly'],
      });
      
      const accounts = await Account.find({ provider: 'google' });
      
      return { 
        success: true, 
        message: 'Google OAuth configured successfully',
        connectedAccounts: accounts.length,
        authUrl: authUrl.substring(0, 100) + '...'
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

const autoRecorder = new FixedNotionAutoRecorder();

// Web interface
app.get('/', async (req, res) => {
  const connections = await autoRecorder.testAllConnections();
  
  res.send(`
    <html>
    <head><title>Fixed Notion Auto-Recording System</title></head>
    <body style="font-family: Arial; max-width: 1200px; margin: 20px auto; padding: 20px;">
        <h1>📝 Fixed Notion Auto-Recording System</h1>
        
        <div style="background: ${connections.overall ? '#d4edda' : '#f8d7da'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>🔌 Connection Status</h3>
            <p><strong>MongoDB:</strong> ${connections.mongodb.success ? '🟢 Connected' : '🔴 Failed'}</p>
            <p><strong>Notion API:</strong> ${connections.notion.success ? '🟢 Connected' : '🔴 Failed'}</p>
            <p><strong>Google OAuth:</strong> ${connections.google.success ? '🟢 Configured' : '🔴 Failed'}</p>
            ${connections.notion.database ? `<p><strong>Database:</strong> ${connections.notion.database.success ? '🟢 ' + connections.notion.database.title : '🔴 ' + connections.notion.database.message}</p>` : ''}
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="/test-fixed-page" style="background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
                🧪 Test Fixed Page Creation
            </a>
            <a href="/check-database" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 10px;">
                📊 Check Database Schema
            </a>
        </div>
    </body>
    </html>
  `);
});

app.get('/check-database', async (req, res) => {
  try {
    if (!process.env.NOTION_DATABASE_ID) {
      return res.send('<h1>❌ No Database ID Set</h1><p>Please set NOTION_DATABASE_ID in your .env file</p><a href="/">🏠 Home</a>');
    }
    
    const schema = await autoRecorder.getDatabaseSchema(process.env.NOTION_DATABASE_ID);
    
    let schemaHtml = '<h3>📊 Database Properties:</h3><ul>';
    Object.entries(schema).forEach(([name, type]) => {
      schemaHtml += `<li><strong>${name}:</strong> ${type}</li>`;
    });
    schemaHtml += '</ul>';
    
    res.send(`
      <h1>📊 Database Schema</h1>
      ${schemaHtml}
      <p><em>The system will automatically adapt to these property types</em></p>
      <a href="/">🏠 Home</a>
    `);
    
  } catch (error) {
    res.send(`<h1>❌ Database Check Failed</h1><p>Error: ${error.message}</p><a href="/">🏠 Home</a>`);
  }
});

app.get('/test-fixed-page', async (req, res) => {
  try {
    const testMeeting = {
      title: 'Test Meeting - Fixed Properties',
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
      meetingPlatform: 'zoom',
      attendees: ['test1@example.com', 'test2@example.com'],
      meetingUrl: 'https://zoom.us/j/123456789'
    };
    
    const pageId = await autoRecorder.createNotionPage(testMeeting, 'system-test@example.com');
    
    res.send(`
      <h1>✅ Test Page Created Successfully!</h1>
      <p><strong>Page ID:</strong> ${pageId}</p>
      <p>Check your Notion database - the page should be created with the correct property types!</p>
      <a href="/">🏠 Home</a>
    `);
    
  } catch (error) {
    res.send(`
      <h1>❌ Test Page Creation Failed</h1>
      <p>Error: ${error.message}</p>
      <a href="/">🏠 Home</a>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`�� Fixed Notion Auto-Recording System: http://localhost:${PORT}`);
  console.log('✅ Now handles existing database schemas properly!');
});
