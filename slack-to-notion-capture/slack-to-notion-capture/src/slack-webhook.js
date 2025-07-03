require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const crypto = require('crypto');
const { sendToNotion } = require('./notion-handler');

const app = express();
app.use(express.json());
app.use(helmet());

// Rate limiting: 30 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Helper: Validate Slack signature
function isValidSlackRequest(req) {
  const slackSecret = process.env.SLACK_WEBHOOK_SECRET;
  const timestamp = req.headers['x-slack-request-timestamp'];
  const sig = req.headers['x-slack-signature'];
  if (!timestamp || !sig) return false;
  // Prevent replay attacks (5 min window)
  if (Math.abs(Date.now() / 1000 - timestamp) > 60 * 5) return false;
  const hmac = crypto.createHmac('sha256', slackSecret);
  const [version, hash] = sig.split('=');
  const baseString = `${version}:${timestamp}:${JSON.stringify(req.body)}`;
  hmac.update(baseString);
  const mySig = `${version}=` + hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(sig));
}

// Helper: Filter out bot messages and irrelevant content
function isRelevantMessage(body) {
  if (!body.event) return false;
  if (body.event.subtype && body.event.subtype !== 'message_changed') return false; // Ignore edits/deletes
  if (body.event.bot_id) return false; // Ignore bot messages
  if (!body.event.text || !body.event.user) return false;
  return true;
}

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.post('/slack/webhook', async (req, res) => {
  if (!isValidSlackRequest(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const body = req.body;
  if (!isRelevantMessage(body)) {
    return res.status(200).json({ status: 'Ignored' });
  }
  const { text, ts, user } = body.event;
  try {
    await sendToNotion(text);
    return res.status(200).json({ status: 'Captured', ts, user });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to capture message' });
  }
});

app.get('/slack/test', (req, res) => {
  res.status(200).json({ status: 'Slack webhook is up and running!' });
});

module.exports = app; 