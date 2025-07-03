// src/simple-server.js
// A basic Express server without MongoDB to test the setup

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple routes
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Meeting Bot Automation API',
    timestamp: new Date().toISOString(),
    status: 'running'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    hasMongoUri: !!process.env.MONGODB_URI
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working!',
    environment: process.env.NODE_ENV,
    envVariables: {
      port: process.env.PORT,
      hasGoogleConfig: !!(process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('your-')),
      hasMongoUri: !!process.env.MONGODB_URI,
      hasJwtSecret: !!(process.env.JWT_SECRET && !process.env.JWT_SECRET.includes('your-'))
    }
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 Server started successfully!');
  console.log(`📍 Running on: http://localhost:${PORT}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 API test: http://localhost:${PORT}/api/test`);
  console.log('');
  console.log('Environment check:');
  console.log('  Port:', PORT);
  console.log('  MongoDB URI set:', !!process.env.MONGODB_URI);
  console.log('  JWT Secret set:', !!(process.env.JWT_SECRET && !process.env.JWT_SECRET.includes('your-')));
  console.log('');
  console.log('Press Ctrl+C to stop');
});

process.on('SIGTERM', () => {
  console.log('👋 Server shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Server shutting down...');
  process.exit(0);
});