require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// Import models
const Account = require('./models/Account');
const Meeting = require('./models/Meeting');
const Rule = require('./models/Rule');
const logger = require('./services/utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Test route to create sample data
app.post('/api/test-data', async (req, res) => {
  try {
    // Create a test account
    const account = new Account({
      userId: 'demo-user',
      email: 'demo@example.com',
      provider: 'google',
      tokens: {
        accessToken: 'demo-access-token',
        refreshToken: 'demo-refresh-token',
        expiryDate: new Date(Date.now() + 3600000)
      },
      calendarId: 'primary'
    });
    
    await account.save();
    logger.info('Created test account');
    
    // Create a test rule
    const rule = new Rule({
      name: 'Demo Rule',
      description: 'Automatically invite bot to standup meetings',
      accountId: account._id,
      conditions: {
        minDuration: 15,
        titleKeywords: ['standup', 'daily']
      },
      actions: {
        inviteBot: true
      }
    });
    
    await rule.save();
    logger.info('Created test rule');
    
    res.json({
      message: 'Test data created successfully',
      account: { id: account._id, email: account.email },
      rule: { id: rule._id, name: rule.name }
    });
    
  } catch (error) {
    logger.error('Error creating test data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all accounts
app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await Account.find().select('-tokens');
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all rules
app.get('/api/rules', async (req, res) => {
  try {
    const rules = await Rule.find().populate('accountId', 'email');
    res.json({ rules });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🔍 Health check: http://localhost:${PORT}/health`);
      console.log(`📊 Test endpoints:`);
      console.log(`   POST http://localhost:${PORT}/api/test-data`);
      console.log(`   GET  http://localhost:${PORT}/api/accounts`);
      console.log(`   GET  http://localhost:${PORT}/api/rules`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
