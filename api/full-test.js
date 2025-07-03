const { sendToNotion } = require('../src/notion-handler');
const { logWebhookAttempt, logError } = require('../src/log-state');

const sampleSlackPayload = {
  token: 'sample-token',
  team_id: 'T12345678',
  api_app_id: 'A12345678',
  event: {
    type: 'message',
    user: 'U12345678',
    text: 'This is a test message for full pipeline urgent newsreel',
    ts: '1623850258.000200',
    channel: 'C12345678',
    event_ts: '1623850258.000200',
  },
  type: 'event_callback',
  event_id: 'Ev12345678',
  event_time: 1623850258,
  authorizations: [],
  is_ext_shared_channel: false,
  event_context: 'EC12345678'
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const results = [];

  // 1. Test Notion connection
  try {
    results.push({ step: 'notion-connection', status: 'pending' });
    // Try to fetch the database (list properties)
    const { Client } = require('@notionhq/client');
    const notion = new Client({ auth: process.env.NOTION_API_KEY });
    const db = await notion.databases.retrieve({ database_id: process.env.NOTION_DATABASE_ID });
    results[results.length - 1] = { step: 'notion-connection', status: 'success', dbTitle: db.title[0]?.plain_text };
  } catch (err) {
    results.push({ step: 'notion-connection', status: 'error', error: err.message });
    return res.status(500).json({ results, sampleSlackPayload });
  }

  // 2. Create a test entry in Notion
  try {
    results.push({ step: 'notion-create-test-entry', status: 'pending' });
    const testEntry = await sendToNotion('Full pipeline test entry from /api/full-test');
    results[results.length - 1] = { step: 'notion-create-test-entry', status: 'success', notionResult: testEntry };
  } catch (err) {
    results.push({ step: 'notion-create-test-entry', status: 'error', error: err.message });
    return res.status(500).json({ results, sampleSlackPayload });
  }

  // 3. Simulate receiving a Slack webhook payload
  results.push({ step: 'simulate-slack-webhook', status: 'success', payload: sampleSlackPayload });

  // 4. Process the payload through the full pipeline
  try {
    results.push({ step: 'process-slack-payload', status: 'pending' });
    // Simulate the logic from webhook.js
    const body = sampleSlackPayload;
    logWebhookAttempt({ type: 'full-test', body });
    if (!body.event || !body.event.text || !body.event.user) {
      throw new Error('Missing required fields in Slack payload');
    }
    const { text, ts, user } = body.event;
    const notionResult = await sendToNotion(text);
    results[results.length - 1] = { step: 'process-slack-payload', status: 'success', notionResult };
  } catch (err) {
    logError(err.message || err);
    results[results.length - 1] = { step: 'process-slack-payload', status: 'error', error: err.message };
    return res.status(500).json({ results, sampleSlackPayload });
  }

  // 5. Return step-by-step results
  return res.status(200).json({ results, sampleSlackPayload });
}; 