// src/api/middleware/auth.js
const jwt = require('jsonwebtoken');
const logger = require('../../services/utils/logger');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn('Invalid token attempt:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '24h' });
};

module.exports = { authenticateToken, generateToken };

// src/api/middleware/rateLimit.js
const { RateLimiterMemory } = require('rate-limiter-flexible');

const rateLimiters = {
  api: new RateLimiterMemory({
    points: 100, // requests
    duration: 60, // per 60 seconds
  }),
  auth: new RateLimiterMemory({
    points: 10, // requests
    duration: 60, // per 60 seconds
  }),
  webhook: new RateLimiterMemory({
    points: 200, // requests
    duration: 60, // per 60 seconds
  })
};

const createRateLimit = (limiterName) => {
  return async (req, res, next) => {
    const limiter = rateLimiters[limiterName];
    if (!limiter) {
      return next();
    }

    try {
      await limiter.consume(req.ip);
      next();
    } catch (rejRes) {
      const remainingPoints = rejRes.remainingPoints;
      const msBeforeNext = rejRes.msBeforeNext;
      
      res.set('Retry-After', Math.round(msBeforeNext / 1000) || 1);
      res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.round(msBeforeNext / 1000)
      });
    }
  };
};

module.exports = { createRateLimit };

// src/api/routes/accounts.js
const express = require('express');
const { AccountController } = require('../controllers/accountController');
const { authenticateToken } = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');

const router = express.Router();
const accountController = new AccountController();

// Apply authentication and rate limiting
router.use(authenticateToken);
router.use(createRateLimit('api'));

// Routes
router.get('/', accountController.getAccounts.bind(accountController));
router.post('/google/connect', accountController.addGoogleAccount.bind(accountController));
router.get('/google/callback', accountController.handleGoogleCallback.bind(accountController));
router.delete('/:accountId', accountController.removeAccount.bind(accountController));
router.patch('/:accountId/toggle', accountController.toggleAccount.bind(accountController));
router.post('/:accountId/sync', accountController.syncAccount.bind(accountController));

module.exports = router;

// src/api/routes/meetings.js
const express = require('express');
const { MeetingController } = require('../controllers/meetingController');
const { authenticateToken } = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');

const router = express.Router();
const meetingController = new MeetingController();

router.use(authenticateToken);
router.use(createRateLimit('api'));

router.get('/', meetingController.getMeetings.bind(meetingController));
router.get('/upcoming', meetingController.getUpcomingMeetings.bind(meetingController));
router.get('/:meetingId', meetingController.getMeeting.bind(meetingController));
router.post('/:meetingId/invite-bot', meetingController.inviteBotToMeeting.bind(meetingController));
router.patch('/:meetingId/status', meetingController.updateMeetingStatus.bind(meetingController));

module.exports = router;

// src/api/routes/rules.js
const express = require('express');
const { RulesController } = require('../controllers/rulesController');
const { authenticateToken } = require('../middleware/auth');
const { createRateLimit } = require('../middleware/rateLimit');
const Joi = require('joi');

const router = express.Router();
const rulesController = new RulesController();

router.use(authenticateToken);
router.use(createRateLimit('api'));

// Validation schemas
const ruleSchema = Joi.object({
  name: Joi.string().required().min(1).max(100),
  description: Joi.string().max(500),
  accountId: Joi.string().when('isGlobal', { is: false, then: Joi.required() }),
  isGlobal: Joi.boolean().default(false),
  conditions: Joi.object({
    minDuration: Joi.number().min(1).max(1440),
    maxDuration: Joi.number().min(1).max(1440),
    minAttendees: Joi.number().min(1).max(100),
    maxAttendees: Joi.number().min(1).max(100),
    titleKeywords: Joi.array().items(Joi.string().min(1).max(50)).max(20),
    titleExclusions: Joi.array().items(Joi.string().min(1).max(50)).max(20),
    attendeeKeywords: Joi.array().items(Joi.string().min(1).max(50)).max(20),
    timeOfDay: Joi.object({
      start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
      end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    }),
    daysOfWeek: Joi.array().items(Joi.number().min(0).max(6)).max(7),
    requiredPlatforms: Joi.array().items(Joi.string().valid('zoom', 'meet', 'teams', 'other')).max(4)
  }),
  actions: Joi.object({
    inviteBot: Joi.boolean().default(true),
    notifyUser: Joi.boolean().default(false),
    customMessage: Joi.string().max(500)
  }),
  priority: Joi.number().min(1).max(10).default(1),
  isActive: Joi.boolean().default(true)
});

// Validation middleware
const validateRule = (req, res, next) => {
  const { error } = ruleSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ 
      error: 'Validation error', 
      details: error.details.map(d => d.message)
    });
  }
  next();
};

// Routes
router.get('/', rulesController.getRules.bind(rulesController));
router.post('/', validateRule, rulesController.createRule.bind(rulesController));
router.patch('/:ruleId', validateRule, rulesController.updateRule.bind(rulesController));
router.delete('/:ruleId', rulesController.deleteRule.bind(rulesController));
router.post('/:ruleId/test', rulesController.testRule.bind(rulesController));

module.exports = router;

// src/api/routes/webhooks.js
const express = require('express');
const { createRateLimit } = require('../middleware/rateLimit');
const MeetingProcessor = require('../../services/core/meetingProcessor');
const logger = require('../../services/utils/logger');

const router = express.Router();
const meetingProcessor = new MeetingProcessor();

router.use(createRateLimit('webhook'));

// Google Calendar webhook
router.post('/google/calendar', async (req, res) => {
  try {
    const { headers, body } = req;
    
    // Verify webhook (implement your verification logic)
    if (!verifyGoogleWebhook(headers, body)) {
      return res.status(401).json({ error: 'Unauthorized webhook' });
    }

    // Extract account info from webhook
    const channelId = headers['x-goog-channel-id'];
    const resourceState = headers['x-goog-resource-state'];
    
    if (resourceState === 'sync') {
      logger.info('Google Calendar sync notification received');
      return res.status(200).send('OK');
    }

    // Process calendar changes
    if (resourceState === 'exists') {
      // Find account by channel ID and process meetings
      const Account = require('../../models/Account');
      const account = await Account.findOne({ 
        'webhookChannelId': channelId,
        isActive: true
      });

      if (account) {
        await meetingProcessor.processAccountMeetings(account._id);
        logger.info(`Processed webhook for account ${account._id}`);
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    logger.error('Error processing Google webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Notion webhook for recording updates
router.post('/notion/recording', async (req, res) => {
  try {
    const { meetingId, recordingUrl, summary, notionPageId } = req.body;
    
    if (!meetingId) {
      return res.status(400).json({ error: 'Missing meetingId' });
    }

    const Meeting = require('../../models/Meeting');
    const meeting = await Meeting.findByIdAndUpdate(
      meetingId,
      {
        recordingUrl,
        summary,
        notionPageId,
        status: 'completed',
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    logger.info(`Recording updated for meeting ${meetingId}`);
    res.json({ message: 'Recording updated successfully' });
  } catch (error) {
    logger.error('Error processing Notion webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

function verifyGoogleWebhook(headers, body) {
  // Implement Google webhook verification
  // This should check the X-Goog-Channel-Token header
  const expectedToken = process.env.GOOGLE_WEBHOOK_TOKEN;
  const receivedToken = headers['x-goog-channel-token'];
  
  return expectedToken === receivedToken;
}

module.exports = router;