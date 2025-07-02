import { sendToNotion } from '../src/notion-handler.js';
import crypto from 'crypto';
import { logWebhookAttempt, logError } from '../src/log-state.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Slack-Request-Timestamp, X-Slack-Signature');
}

function isValidSlackRequest(req) {
  const slackSecret = process.env.SLACK_WEBHOOK_SECRET;
  const timestamp = req.headers['x-slack-request-timestamp'];
  const sig = req.headers['x-slack-signature'];
  if (!timestamp || !sig) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > 60 * 5) return false;
  const hmac = crypto.createHmac('sha256', slackSecret);
  const [version, hash] = sig.split('=');
  const baseString = `${version}:${timestamp}:${JSON.stringify(req.body)}`;
  hmac.update(baseString);
  const mySig = `${version}=` + hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(sig));
}

function isRelevantMessage(body) {
  if (!body.event) return false;
  if (body.event.subtype && body.event.subtype !== 'message_changed') return false;
  if (body.event.bot_id) return false;
  if (!body.event.text || !body.event.user) return false;
  return true;
}

export default async function handler(req, res) {
  setCorsHeaders(res);
  console.log('[WEBHOOK] Incoming request:', {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {
      logError('Invalid JSON in request body');
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }
  logWebhookAttempt({ type: 'webhook', body });
  if (!isValidSlackRequest({ ...req, body })) {
    logError('Invalid Slack signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  if (!isRelevantMessage(body)) {
    console.log('[WEBHOOK] Ignored irrelevant message.');
    return res.status(200).json({ status: 'Ignored' });
  }
  const { text, ts, user } = body.event;
  if (!text || !user) {
    logError('Missing required fields: text or user');
    return res.status(400).json({ error: 'Missing required fields: text or user' });
  }
  try {
    console.log('[WEBHOOK] Sending to Notion:', { text, ts, user });
    const notionResult = await sendToNotion(text);
    console.log('[WEBHOOK] Notion API result:', notionResult);
    return res.status(200).json({ status: 'Captured', ts, user, notionResult });
  } catch (err) {
    logError(err.message || err);
    console.error('[WEBHOOK] Notion error:', err);
    return res.status(500).json({ error: 'Failed to capture message', details: err.message });
  }
} 