# .env.example
# Server Configuration
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001

# Database
MONGODB_URI=mongodb://localhost:27017/meeting-bot-automation

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Encryption Key for storing tokens
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/accounts/google/callback

# Google Webhook Token (for calendar change notifications)
GOOGLE_WEBHOOK_TOKEN=your-random-webhook-token

# Notion Configuration
NOTION_API_KEY=your-notion-integration-api-key
NOTION_BOT_EMAIL=meetingbot@yourdomain.com

# Redis (for rate limiting and caching)
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info

# Email Configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# scripts/setup.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class SetupScript {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.envPath = path.join(this.projectRoot, '.env');
    this.envExamplePath =