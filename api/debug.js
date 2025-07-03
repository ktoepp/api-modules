import { Client } from '@notionhq/client';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: {
        hasNotionApiKey: !!process.env.NOTION_API_KEY,
        hasNotionDatabaseId: !!process.env.NOTION_DATABASE_ID,
        hasSlackWebhookSecret: !!process.env.SLACK_WEBHOOK_SECRET,
        notionApiKeyPrefix: process.env.NOTION_API_KEY ? process.env.NOTION_API_KEY.substring(0, 10) + '...' : 'NOT_SET',
        notionDatabaseId: process.env.NOTION_DATABASE_ID || 'NOT_SET'
      },
      notion: {
        connected: false,
        databaseInfo: null,
        error: null
      }
    };

    // Test Notion connection
    if (process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID) {
      try {
        const notion = new Client({ auth: process.env.NOTION_API_KEY });
        
        // Get database info
        const database = await notion.databases.retrieve({
          database_id: process.env.NOTION_DATABASE_ID
        });
        
        debugInfo.notion.connected = true;
        debugInfo.notion.databaseInfo = {
          id: database.id,
          title: database.title[0]?.plain_text || 'Untitled',
          properties: Object.keys(database.properties),
          propertyTypes: Object.entries(database.properties).reduce((acc, [key, value]) => {
            acc[key] = value.type;
            return acc;
          }, {})
        };

        // Test creating a page
        if (req.method === 'POST') {
          try {
            const testPage = await notion.pages.create({
              parent: { database_id: process.env.NOTION_DATABASE_ID },
              properties: {
                'Title': {
                  title: [{ text: { content: 'Debug Test Page' } }]
                },
                'Raw Content': {
                  rich_text: [{ text: { content: 'This is a test page created by the debug endpoint' } }]
                },
                'Content Type': {
                  select: { name: 'Random' }
                },
                'Status': {
                  select: { name: 'Captured' }
                },
                'Priority': {
                  select: { name: 'Medium' }
                }
              }
            });
            
            debugInfo.notion.testPageCreated = {
              id: testPage.id,
              url: testPage.url
            };
          } catch (createError) {
            debugInfo.notion.createError = createError.message;
          }
        }

      } catch (notionError) {
        debugInfo.notion.error = notionError.message;
        debugInfo.notion.errorCode = notionError.code;
      }
    }

    return res.status(200).json(debugInfo);

  } catch (error) {
    return res.status(500).json({
      error: 'Debug endpoint failed',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
} 