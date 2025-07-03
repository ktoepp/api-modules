// src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
require('dotenv').config();

const logger = require('./services/utils/logger');
const scheduler = require('./services/core/scheduler');

// Import routes
const accountRoutes = require('./api/routes/accounts');
const meetingRoutes = require('./api/routes/meetings');
const ruleRoutes = require('./api/routes/rules');
const webhookRoutes = require('./api/routes/webhooks');

class App {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
  }

  async initialize() {
    try {
      // Connect to database
      await this.connectDatabase();
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Start scheduler
      await scheduler.start();
      
      logger.info('Application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  async connectDatabase() {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      logger.info('Connected to MongoDB');
    } catch (error) {
      logger.error('MongoDB connection error:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      credentials: true
    }));
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });

    // API routes
    this.app.use('/api/accounts', accountRoutes);
    this.app.use('/api/meetings', meetingRoutes);
    this.app.use('/api/rules', ruleRoutes);
    this.app.use('/api/webhooks', webhookRoutes);

    // Auth routes
    this.app.use('/api/auth', this.createAuthRoutes());

    // Serve frontend in production
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static('dist'));
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../dist/index.html'));
      });
    }

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });
  }

  createAuthRoutes() {
    const router = express.Router();
    const { generateToken } = require('./api/middleware/auth');
    const { createRateLimit } = require('./api/middleware/rateLimit');

    router.use(createRateLimit('auth'));

    // Simple auth for demo - replace with your preferred auth system
    router.post('/login', async (req, res) => {
      try {
        const { userId } = req.body;
        
        if (!userId) {
          return res.status(400).json({ error: 'User ID required' });
        }

        const token = generateToken(userId);
        res.json({ token, userId });
      } catch (error) {
        logger.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
      }
    });

    return router;
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error:', error);
      
      if (res.headersSent) {
        return next(error);
      }

      const isDevelopment = process.env.NODE_ENV === 'development';
      
      res.status(500).json({
        error: 'Internal server error',
        message: isDevelopment ? error.message : 'Something went wrong',
        stack: isDevelopment ? error.stack : undefined
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  async start() {
    try {
      await this.initialize();
      
      this.server = this.app.listen(this.port, () => {
        logger.info(`Server running on port ${this.port}`);
      });

      return this.server;
    } catch (error) {
      logger.error('Failed to start server:', error);
      throw error;
    }
  }

  async stop() {
    try {
      await scheduler.stop();
      
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
      }
      
      await mongoose.disconnect();
      logger.info('Application stopped gracefully');
    } catch (error) {
      logger.error('Error stopping application:', error);
      throw error;
    }
  }
}

// src/services/core/scheduler.js
const cron = require('node-cron');
const MeetingProcessor = require('./meetingProcessor');
const logger = require('../utils/logger');

class Scheduler {
  constructor() {
    this.meetingProcessor = new MeetingProcessor();
    this.tasks = new Map();
  }

  async start() {
    logger.info('Starting scheduler...');

    // Process all accounts every 15 minutes
    this.scheduleTask('processAllAccounts', '*/15 * * * *', async () => {
      try {
        await this.meetingProcessor.processAllActiveAccounts();
        logger.info('Scheduled processing completed');
      } catch (error) {
        logger.error('Scheduled processing failed:', error);
      }
    });

    // Clean up old meetings daily at 2 AM
    this.scheduleTask('cleanupMeetings', '0 2 * * *', async () => {
      try {
        await this.cleanupOldMeetings();
        logger.info('Meeting cleanup completed');
      } catch (error) {
        logger.error('Meeting cleanup failed:', error);
      }
    });

    // Send upcoming meeting notifications every hour
    this.scheduleTask('upcomingNotifications', '0 * * * *', async () => {
      try {
        await this.sendUpcomingMeetingNotifications();
        logger.info('Upcoming meeting notifications sent');
      } catch (error) {
        logger.error('Notification sending failed:', error);
      }
    });

    // Refresh expired tokens every 6 hours
    this.scheduleTask('refreshTokens', '0 */6 * * *', async () => {
      try {
        await this.refreshExpiredTokens();
        logger.info('Token refresh completed');
      } catch (error) {
        logger.error('Token refresh failed:', error);
      }
    });

    logger.info('Scheduler started successfully');
  }

  scheduleTask(name, pattern, task) {
    if (this.tasks.has(name)) {
      logger.warn(`Task ${name} already exists, stopping previous instance`);
      this.tasks.get(name).stop();
    }

    const scheduledTask = cron.schedule(pattern, task, { scheduled: false });
    this.tasks.set(name, scheduledTask);
    scheduledTask.start();
    
    logger.info(`Scheduled task: ${name} with pattern: ${pattern}`);
  }

  async cleanupOldMeetings() {
    const Meeting = require('../../models/Meeting');
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const result = await Meeting.deleteMany({
      endTime: { $lt: cutoffDate },
      status: { $in: ['completed', 'failed'] }
    });

    logger.info(`Cleaned up ${result.deletedCount} old meetings`);
  }

  async sendUpcomingMeetingNotifications() {
    const Account = require('../../models/Account');
    const accounts = await Account.find({ 
      isActive: true,
      'settings.autoInviteBot': true 
    });

    for (const account of accounts) {
      try {
        const upcomingMeetings = await this.meetingProcessor.getUpcomingMeetings(
          account._id, 
          2 // Next 2 hours
        );

        const meetingsNeedingBot = upcomingMeetings.filter(m => 
          !m.botInvited && m.status === 'pending'
        );

        if (meetingsNeedingBot.length > 0) {
          logger.info(`Found ${meetingsNeedingBot.length} meetings needing bot for account ${account._id}`);
          
          for (const meeting of meetingsNeedingBot) {
            await this.meetingProcessor.processSingleMeeting(meeting);
          }
        }
      } catch (error) {
        logger.error(`Error processing notifications for account ${account._id}:`, error);
      }
    }
  }

  async refreshExpiredTokens() {
    const Account = require('../../models/Account');
    const { GoogleAuthService } = require('../integrations/google/authService');
    
    const googleAuth = new GoogleAuthService();
    await googleAuth.initialize();

    // Find accounts with tokens expiring in the next hour
    const expirationThreshold = new Date(Date.now() + 60 * 60 * 1000);
    
    const accounts = await Account.find({
      isActive: true,
      'tokens.expiryDate': { $lt: expirationThreshold }
    });

    for (const account of accounts) {
      try {
        const decryptedTokens = await googleAuth.getDecryptedTokens(account._id);
        const newTokens = await googleAuth.refreshToken(decryptedTokens.refresh_token);
        
        await googleAuth.saveAccountTokens(
          account.email,
          newTokens,
          account.userId
        );

        logger.info(`Refreshed tokens for account ${account._id}`);
      } catch (error) {
        logger.error(`Failed to refresh tokens for account ${account._id}:`, error);
        
        // Mark account as inactive if refresh fails
        await Account.findByIdAndUpdate(account._id, { 
          isActive: false,
          lastError: error.message
        });
      }
    }
  }

  async stop() {
    logger.info('Stopping scheduler...');
    
    for (const [name, task] of this.tasks) {
      task.stop();
      logger.info(`Stopped task: ${name}`);
    }
    
    this.tasks.clear();
    logger.info('Scheduler stopped');
  }

  getTaskStatus() {
    const status = {};
    for (const [name, task] of this.tasks) {
      status[name] = {
        running: task.running || false,
        scheduled: true
      };
    }
    return status;
  }
}

// src/services/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'meeting-bot-automation' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;

// Create app instance and start
const app = new App();

if (require.main === module) {
  app.start().catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });
}

module.exports = { App, Scheduler };