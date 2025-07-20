// src/services/integrations/notion/notionService.js
const { Client } = require('@notionhq/client');
const logger = require('../../utils/logger');

class NotionService {
  constructor() {
    this.notion = new Client({
      auth: process.env.NOTION_API_KEY,
    });
    this.databaseId = process.env.NOTION_DATABASE_ID;
  }

  async createMeetingPage(meeting, accountEmail) {
    try {
      console.log(`📝 Creating Notion page for: ${meeting.title}`);

      // Prepare the page properties based on actual database structure
      const properties = {
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
        'Attendees': {
          rich_text: [
            {
              text: {
                content: meeting.attendees.join(', ') || 'No attendees'
              }
            }
          ]
        },
        'Duration (mins)': {
          number: Math.round((meeting.endTime - meeting.startTime) / (1000 * 60))
        }
      };

      // Add meeting URL if available
      if (meeting.meetingUrl && meeting.meetingUrl !== 'Not available') {
        properties['Meeting URL'] = {
          url: meeting.meetingUrl
        };
      }

      // Create the page
      const response = await this.notion.pages.create({
        parent: {
          database_id: this.databaseId
        },
        properties: properties,
        children: [
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Meeting Details'
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
                    content: `**Start Time:** ${meeting.startTime.toLocaleString()}`
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
                    content: `**End Time:** ${meeting.endTime.toLocaleString()}`
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
                    content: `**Platform:** ${this.getPlatformName(meeting.meetingPlatform)}`
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
                    content: `**Attendees:** ${meeting.attendees.join(', ')}`
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'divider',
            divider: {}
          },
          {
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: 'Notes'
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
                    content: 'Add your meeting notes here...'
                  }
                }
              ]
            }
          },
          {
            object: 'block',
            type: 'divider',
            divider: {}
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
                    content: 'Add action items here...'
                  }
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
      console.error(`❌ Error creating Notion page for ${meeting.title}:`, error.message);
      throw error;
    }
  }

  async updateMeetingPage(pageId, meeting) {
    try {
      console.log(`📝 Updating Notion page: ${pageId}`);

      const properties = {
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
        'Attendees': {
          rich_text: [
            {
              text: {
                content: meeting.attendees.join(', ') || 'No attendees'
              }
            }
          ]
        },
        'Duration (mins)': {
          number: Math.round((meeting.endTime - meeting.startTime) / (1000 * 60))
        }
      };

      if (meeting.meetingUrl && meeting.meetingUrl !== 'Not available') {
        properties['Meeting URL'] = {
          url: meeting.meetingUrl
        };
      }

      await this.notion.pages.update({
        page_id: pageId,
        properties: properties
      });

      console.log(`✅ Notion page updated: ${pageId}`);

    } catch (error) {
      console.error(`❌ Error updating Notion page ${pageId}:`, error.message);
      throw error;
    }
  }

  getPlatformName(platform) {
    const platformMap = {
      'meet': 'Google Meet',
      'zoom': 'Zoom',
      'teams': 'Microsoft Teams',
      'other': 'Other'
    };
    return platformMap[platform] || 'Other';
  }

  async testConnection() {
    try {
      const response = await this.notion.databases.retrieve({
        database_id: this.databaseId
      });
      console.log(`✅ Notion connection successful. Database: ${response.title[0]?.plain_text || 'Untitled'}`);
      return true;
    } catch (error) {
      console.error('❌ Notion connection failed:', error.message);
      return false;
    }
  }
}

module.exports = NotionService;