import { Client } from '@notionhq/client';
import crypto from 'crypto';
import { logWebhookAttempt, logError } from '../src/log-state.js';

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isValidSlackRequest(req) {
  const slackSecret = process.env.SLACK_WEBHOOK_SECRET;
  
  // If no secret is configured, skip validation (for development)
  if (!slackSecret) {
    console.warn('SLACK_WEBHOOK_SECRET not configured - skipping signature validation');
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
  const baseString = `${version}:${timestamp}:${JSON.stringify(req.body)}`;
  hmac.update(baseString);
  const mySig = `${version}=` + hmac.digest('hex');
  
  const isValid = crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(sig));
  if (!isValid) {
    console.error('Invalid signature:', { expected: mySig, received: sig });
  }
  
  return isValid;
}

function isRelevantMessage(body) {
  if (!body.event) return false;
  if (body.event.subtype && body.event.subtype !== 'message_changed') return false;
  if (body.event.bot_id) return false;
  if (!body.event.text || !body.event.user) return false;
  return true;
}

async function sendToNotion(messageText) {
  try {
    // Auto-detect content type based on keywords
    let meetingType = 'General';
    let project = 'General';
    
    const text = messageText.toLowerCase();
    if (text.includes('newsreel') || text.includes('polling') || text.includes('dashboard')) {
      meetingType = 'Newsreel';
      project = 'Newsreel';
    } else if (text.includes('freelance') || text.includes('calculator') || text.includes('tool')) {
      meetingType = 'Freelance';
      project = 'Freelance';
    } else if (text.includes('zine') || text.includes('analog') || text.includes('drawing')) {
      meetingType = 'Personal';
      project = 'Personal';
    }
    
    // Extract action items from urgent keywords
    let actionItems = [];
    if (text.includes('urgent') || text.includes('deadline') || text.includes('asap')) {
      actionItems.push('Urgent action required');
    }

    console.log('Creating Notion page with properties:', {
      meetingType,
      project,
      actionItems,
      messageLength: messageText.length
    });

    // Create Notion database entry using the correct properties
    const response = await notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        'Meeting Title': {
          title: [{ text: { content: messageText.substring(0, 100) } }]
        },
        'Notes': {
          rich_text: [{ text: { content: messageText } }]
        },
        'Meeting Type': {
          select: { name: meetingType }
        },
        'Project': {
          select: { name: project }
        },
        'Action Items': {
          rich_text: actionItems.length > 0 ? [{ text: { content: actionItems.join(', ') } }] : []
        },
        'Date': {
          date: { start: new Date().toISOString() }
        },
        'Duration (mins)': {
          number: 0
        },
        'Attendees': {
          number: 1
        }
      }
    });

    console.log('Notion page created successfully:', response.id);
    return response;
  } catch (error) {
    console.error('Error creating Notion page:', error);
    throw error;
  }
}

export default async function handler(req, res) {
  // Log every request that hits the webhook
  console.log('=== WEBHOOK HIT ===');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  console.log('===================');

  setCorsHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ensure body is parsed as JSON
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      console.error('Failed to parse JSON body:', e);
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }

  try {
    // Handle Slack challenge (for initial setup)
    if (body.challenge) {
      console.log('Slack challenge received:', body.challenge);
      return res.status(200).json({ challenge: body.challenge });
    }

    // Validate Slack signature (if secret is configured)
    if (!isValidSlackRequest(req)) {
      console.error('Invalid Slack request signature');
      return res.status(401).json({ error: 'Invalid request signature' });
    }

    // Process actual message
    if (body.event && body.event.text) {
      const messageText = body.event.text;
      
      // Skip bot messages
      if (body.event.bot_id) {
        console.log('Ignored bot message');
        return res.status(200).json({ status: 'ignored bot message' });
      }

      console.log('Processing message:', messageText);
      
      const notionResult = await sendToNotion(messageText);
      
      console.log('Notion API result:', notionResult);
      return res.status(200).json({ 
        status: 'success', 
        message: 'Captured to Notion',
        notionId: notionResult.id
      });
    }

    console.log('No action needed for this request');
    return res.status(200).json({ status: 'no action needed' });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      error: 'Failed to process webhook',
      details: error.message 
    });
  }
} 