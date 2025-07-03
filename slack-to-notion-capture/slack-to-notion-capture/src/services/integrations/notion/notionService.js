// src/services/integrations/notion/notionService.js
const { Client } = require('@notionhq/client');
const IntegrationBase = require('../../base/integrationBase');
const logger = require('../../utils/logger');

class NotionService extends IntegrationBase {
  constructor() {
    super('notion', {
      apiVersion: '2022-06-28'
    });
    this.client = null;
    this.databaseId = process.env.NOTION_DATABASE_ID;
  }

  async initialize() {
    this.client = new Client({
      auth: process.env.NOTION_API_KEY,
      notionVersion: this.config.apiVersion
    });
    this.initialized = true;
    logger.info('Notion service initialized');
  }

  async createMeetingPage(meeting) {
    try {
      if (!this.initialized) await this.initialize();

      const pageProperties = {
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
            name: this.mapStatusToNotion(meeting.status)
          }
        },
        'Platform': {
          select: {
            name: meeting.meetingPlatform || 'Other'
          }
        },
        'Attendees': {
          number: meeting.attendees.length
        }
      };

      // Add meeting URL if available
      if (meeting.meetingUrl) {
        pageProperties['Meeting URL'] = {
          url: meeting.meetingUrl
        };
      }

      const response = await this.client.pages.create({
        parent: {
          database_id: this.databaseId
        },
        properties: pageProperties,
        children: [
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
                    content: 'This page was automatically created for meeting recording and notes.'
                  }
                }
              ]
            }
          }
        ]
      });

      logger.info(`Created Notion page for meeting ${meeting._id}: ${response.id}`);
      return response.id;

    } catch (error) {
      logger.error('Error creating Notion page:', error);
      throw error;
    }
  }

  async updateMeetingPage(pageId, updates) {
    try {
      if (!this.initialized) await this.initialize();

      const properties = {};

      if (updates.summary) {
        properties['Summary'] = {
          rich_text: [
            {
              type: 'text',
              text: {
                content: updates.summary.substring(0, 2000) // Notion rich text limit
              }
            }
          ]
        };
      }

      if (updates.recordingUrl) {
        properties['Recording URL'] = {
          url: updates.recordingUrl
        };
      }

      if (updates.status) {
        properties['Status'] = {
          select: {
            name: this.mapStatusToNotion(updates.status)
          }
        };
      }

      const response = await this.client.pages.update({
        page_id: pageId,
        properties
      });

      // Add summary as content if provided
      if (updates.summary) {
        await this.appendSummaryContent(pageId, updates.summary);
      }

      logger.info(`Updated Notion page ${pageId}`);
      return response;

    } catch (error) {
      logger.error('Error updating Notion page:', error);
      throw error;
    }
  }

  async appendSummaryContent(pageId, summary) {
    try {
      // Split summary into paragraphs
      const paragraphs = summary.split('\n\n').filter(p => p.trim());
      
      const blocks = [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: 'AI Generated Summary'
                }
              }
            ]
          }
        }
      ];

      // Add each paragraph as a block
      paragraphs.forEach(paragraph => {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content: paragraph.substring(0, 2000) // Notion text limit
                }
              }
            ]
          }
        });
      });

      await this.client.blocks.children.append({
        block_id: pageId,
        children: blocks
      });

    } catch (error) {
      logger.error('Error appending summary to Notion page:', error);
      throw error;
    }
  }

  async createDatabase() {
    try {
      if (!this.initialized) await this.initialize();

      const database = await this.client.databases.create({
        parent: {
          type: 'page_id',
          page_id: process.env.NOTION_PARENT_PAGE_ID
        },
        title: [
          {
            type: 'text',
            text: {
              content: 'Meeting Recordings'
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
                { name: 'Pending', color: 'yellow' },
                { name: 'Recording', color: 'blue' },
                { name: 'Completed', color: 'green' },
                { name: 'Failed', color: 'red' }
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
          'Attendees': {
            number: {}
          },
          'Meeting URL': {
            url: {}
          },
          'Recording URL': {
            url: {}
          },
          'Summary': {
            rich_text: {}
          }
        }
      });

      logger.info(`Created Notion database: ${database.id}`);
      return database.id;

    } catch (error) {
      logger.error('Error creating Notion database:', error);
      throw error;
    }
  }

  mapStatusToNotion(status) {
    const statusMap = {
      'pending': 'Pending',
      'bot_invited': 'Pending',
      'recording': 'Recording',
      'completed': 'Completed',
      'failed': 'Failed'
    };
    return statusMap[status] || 'Pending';
  }

  async searchPages(query) {
    try {
      if (!this.initialized) await this.initialize();

      const response = await this.client.search({
        query,
        filter: {
          value: 'page',
          property: 'object'
        }
      });

      return response.results;
    } catch (error) {
      logger.error('Error searching Notion pages:', error);
      throw error;
    }
  }
}

// src/services/integrations/notion/botService.js
class NotionBotService extends IntegrationBase {
  constructor() {
    super('notion-bot', {});
    this.notionService = new NotionService();
    this.botEmail = process.env.NOTION_BOT_EMAIL;
  }

  async initialize() {
    await this.notionService.initialize();
    this.initialized = true;
  }

  async handleMeetingStart(meeting) {
    try {
      logger.info(`Bot joining meeting: ${meeting.title}`);
      
      // Create Notion page for the meeting
      const notionPageId = await this.notionService.createMeetingPage(meeting);
      
      // Update meeting with Notion page ID
      const Meeting = require('../../../models/Meeting');
      await Meeting.findByIdAndUpdate(meeting._id, {
        notionPageId,
        status: 'recording'
      });

      return { success: true, notionPageId };
    } catch (error) {
      logger.error('Error handling meeting start:', error);
      throw error;
    }
  }

  async handleMeetingEnd(meeting, recordingData) {
    try {
      logger.info(`Bot finished recording meeting: ${meeting.title}`);

      const updates = {
        status: 'completed',
        recordingUrl: recordingData.recordingUrl,
        summary: recordingData.summary
      };

      // Update Notion page
      if (meeting.notionPageId) {
        await this.notionService.updateMeetingPage(meeting.notionPageId, updates);
      }

      // Update meeting in database
      const Meeting = require('../../../models/Meeting');
      await Meeting.findByIdAndUpdate(meeting._id, {
        ...updates,
        updatedAt: new Date()
      });

      return { success: true };
    } catch (error) {
      logger.error('Error handling meeting end:', error);
      throw error;
    }
  }

  async generateMeetingSummary(transcript) {
    // This would integrate with your AI summarization service
    // For now, return a basic summary
    try {
      const lines = transcript.split('\n').filter(line => line.trim());
      const summary = lines.slice(0, 10).join('\n'); // Basic summary
      
      return {
        summary: `Meeting Summary:\n\n${summary}`,
        keyPoints: this.extractKeyPoints(transcript),
        actionItems: this.extractActionItems(transcript)
      };
    } catch (error) {
      logger.error('Error generating meeting summary:', error);
      return {
        summary: 'Summary generation failed',
        keyPoints: [],
        actionItems: []
      };
    }
  }

  extractKeyPoints(transcript) {
    // Simple keyword extraction - replace with proper NLP
    const keywords = ['decision', 'important', 'action', 'deadline', 'follow up'];
    const lines = transcript.split('\n');
    
    return lines.filter(line => 
      keywords.some(keyword => line.toLowerCase().includes(keyword))
    ).slice(0, 5);
  }

  extractActionItems(transcript) {
    // Simple action item extraction - replace with proper NLP
    const actionWords = ['will', 'should', 'need to', 'action', 'todo'];
    const lines = transcript.split('\n');
    
    return lines.filter(line => 
      actionWords.some(word => line.toLowerCase().includes(word))
    ).slice(0, 5);
  }
}

module.exports = { NotionService, NotionBotService };

// README.md content for final setup
/*
# Meeting Bot Automation

Automatically invite meeting bots to your calendar events across multiple Gmail accounts with customizable rules.

## Features

- **Multi-Account Support**: Connect multiple Gmail accounts
- **Smart Rule Engine**: Customizable conditions for auto-inviting bots
- **Meeting Platforms**: Support for Zoom, Google Meet, Microsoft Teams
- **Notion Integration**: Automatic meeting notes and summaries
- **Real-time Processing**: Calendar webhook integration
- **Dashboard**: Web interface for management

## Quick Start

1. **Clone and Setup**
   ```bash
   git clone <your-repo>
   cd meeting-bot-automation
   npm run setup
   ```

2. **Configure Google OAuth**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create project and enable Calendar + Gmail APIs
   - Create OAuth 2.0 credentials
   - Update `.env` with client ID/secret

3. **Configure Notion**
   - Create [Notion Integration](https://www.notion.so/my-integrations)
   - Update `.env` with API key
   - Create dedicated bot email

4. **Start Application**
   ```bash
   npm run dev
   ```

5. **Access Dashboard**
   - Open http://localhost:3000
   - Connect your Gmail accounts
   - Set up automation rules

## API Endpoints

### Accounts
- `GET /api/accounts` - List connected accounts
- `POST /api/accounts/google/connect` - Connect Google account
- `POST /api/accounts/:id/sync` - Sync account meetings

### Meetings
- `GET /api/meetings` - List meetings
- `GET /api/meetings/upcoming` - Get upcoming meetings
- `POST /api/meetings/:id/invite-bot` - Manually invite bot

### Rules
- `GET /api/rules` - List automation rules
- `POST /api/rules` - Create new rule
- `PATCH /api/rules/:id` - Update rule
- `DELETE /api/rules/:id` - Delete rule

## Deployment

### Docker Deployment
```bash
docker-compose up -d
```

### Manual Deployment
1. Set `NODE_ENV=production`
2. Configure production database
3. Set up SSL certificates
4. Configure reverse proxy

## Architecture

- **Backend**: Node.js + Express
- **Database**: MongoDB
- **Cache**: Redis
- **Frontend**: React
- **Integrations**: Google APIs, Notion API
- **Scheduling**: Node-cron

## Adding New Integrations

1. Extend `IntegrationBase` class
2. Implement required methods
3. Add to integration registry
4. Update frontend components

## Security

- JWT authentication
- Token encryption at rest
- Rate limiting
- Input validation
- HTTPS enforcement

## Contributing

1. Fork the repository
2. Create feature branch
3. Add tests
4. Submit pull request

## License

MIT License - see LICENSE file
*/