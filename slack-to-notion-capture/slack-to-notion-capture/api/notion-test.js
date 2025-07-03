import { Client } from '@notionhq/client';

export default async function handler(req, res) {
  try {
    // Check environment variables
    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_DATABASE_ID;
    
    if (!apiKey || !databaseId) {
      return res.status(500).json({
        error: 'Missing environment variables',
        hasApiKey: !!apiKey,
        hasDatabaseId: !!databaseId
      });
    }

    // Initialize Notion client
    const notion = new Client({ auth: apiKey });

    // Test database access
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 1
    });

    return res.status(200).json({
      success: true,
      message: 'Notion connection successful!',
      databaseTitle: response.results[0]?.properties || 'No entries yet',
      totalEntries: response.results.length
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'unknown'
    });
  }
} 