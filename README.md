# Slack to Notion Integration

A production-ready Slack slash command that automatically creates Notion database entries with AI-generated titles and clickable "View in Notion" links.

## 🚀 Features

- **Slack Slash Command**: `/ntn [message]` creates Notion database entries
- **AI-Generated Titles**: Automatic title generation for better organization
- **Clickable Links**: Direct "View in Notion" links in Slack responses
- **Production Ready**: Deployed on Railway for 24/7 availability
- **Error Handling**: Comprehensive error handling and logging
- **Health Monitoring**: Built-in health check endpoint

## 📋 Prerequisites

- Node.js 18+ 
- Slack App with slash command permissions
- Notion API integration
- Notion database with specific properties

## 🛠️ Setup

### 1. Environment Variables

Create a `.env` file in the root directory:

```bash
NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=your_notion_database_id
SLACK_SIGNING_SECRET=your_slack_signing_secret
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Production Deployment (Recommended)

The application is deployed on Railway for 24/7 availability:

**Production URL**: `https://slack-to-notion-production.up.railway.app`

#### Railway Deployment Status:
- ✅ **Online**: 24/7 availability
- ✅ **Environment Variables**: All configured
- ✅ **Health Check**: `/health` endpoint working
- ✅ **Slack Integration**: Ready for team use

### 4. Local Development (Optional)

For local development and testing:

```bash
# Install PM2 for process management
npm install -g pm2

# Start the server
pm2 start ecosystem.config.js
pm2 save

# Check status
pm2 status

# Stop local server (when switching to production)
pm2 stop slack-to-notion
```

## 📡 Slack App Configuration

### Production Setup (Recommended)

1. **Go to**: https://api.slack.com/apps
2. **Select your app** (the one with `/ntn` command)
3. **Go to "Slash Commands"** in the left sidebar
4. **Click "Edit"** on the `/ntn` command
5. **Update Request URL** to:
   ```
   https://slack-to-notion-production.up.railway.app/api/slash-command
   ```
6. **Save the changes**

### Local Development Setup

If using local development, use ngrok for Slack URL verification:

```bash
# Install ngrok
npm install -g ngrok

# Start ngrok tunnel
ngrok http 3000

# Use the ngrok URL in Slack app configuration
# Example: https://c07f6ae0f025.ngrok-free.app/api/slash-command
```

## 🗄️ Notion Database Setup

Your Notion database should have these properties:

- **title** (Title): Auto-generated from message content
- **Content** (Rich text): The actual message content
- **Date** (Date): Current date when entry is created

### Sharing with Integration

1. **Go to your Notion database**
2. **Click "Share"** in the top right
3. **Click "Invite"**
4. **Search for your integration name**
5. **Add the integration** with "Can edit" permissions

## 🎯 Usage

### For Users

Simply use the slash command in Slack:

```
/ntn This is a test message that will be added to Notion
```

### Response

Users will receive a confirmation message with:
- ✅ Success confirmation
- 🔗 Clickable "View in Notion" link
- 📅 Timestamp of creation

## 🔧 API Endpoints

### Production Endpoints

- **Health Check**: `https://slack-to-notion-production.up.railway.app/health`
- **Slack Command**: `https://slack-to-notion-production.up.railway.app/api/slash-command`
- **Test Endpoint**: `https://slack-to-notion-production.up.railway.app/api/test-slash`

### Local Endpoints (if running locally)

- **Health Check**: `http://localhost:3000/health`
- **Slack Command**: `http://localhost:3000/api/slash-command`
- **Test Endpoint**: `http://localhost:3000/api/test-slash`

## 📊 Monitoring

### Railway Dashboard

Monitor your deployment at: https://railway.app/dashboard

### Health Check

Check if the service is running:

```bash
curl https://slack-to-notion-production.up.railway.app/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-07-20T05:55:07.466Z",
  "environment": {
    "notionApiKey": true,
    "notionDatabaseId": true,
    "slackSigningSecret": true
  }
}
```

## 🚀 Deployment Status

### Current Status: ✅ PRODUCTION READY

- **Platform**: Railway
- **URL**: `https://slack-to-notion-production.up.railway.app`
- **Availability**: 24/7
- **Team Access**: ✅ All team members can use `/ntn`
- **Local Server**: ❌ Stopped (switched to cloud)

### Benefits of Production Deployment

- ✅ **Always Online**: Works even when your computer is off
- ✅ **Team Access**: Multiple users can use simultaneously
- ✅ **No Local Dependencies**: No need to keep computer running
- ✅ **Automatic Scaling**: Handles multiple requests
- ✅ **Reliable**: Railway handles uptime and restarts

## 📁 Project Structure

```
api-modules/
├── src/
│   └── slash-command-server.js    # Main server file
├── ecosystem.config.js            # PM2 configuration
├── package.json                   # Dependencies
├── README.md                      # This file
├── SETUP_GUIDE.md                # Quick setup guide
├── DEPLOYMENT_GUIDE.md           # Deployment options
├── PROJECT_SUMMARY.md            # Project overview
└── archive/                      # Archived old files
```

## 🔧 Maintenance

### Railway Management

```bash
# Check deployment status
railway status

# View logs
railway logs

# Update environment variables
railway variables --set "KEY=value"

# Redeploy
railway up
```

### Local Development

```bash
# Start local server
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs slack-to-notion

# Stop server
pm2 stop slack-to-notion

# Restart server
pm2 restart slack-to-notion
```

## 🐛 Troubleshooting

### Common Issues

1. **"Could not find database"**: Make sure the Notion database is shared with your integration
2. **"Name is not a property"**: Ensure database has "title" property (not "Name")
3. **Slack command not working**: Verify the Request URL is correct in Slack app settings
4. **Railway deployment issues**: Check Railway dashboard for logs

### Health Check Failures

If the health check fails:

1. **Check Railway dashboard** for deployment status
2. **Verify environment variables** are set correctly
3. **Check Notion API key** is valid
4. **Ensure database ID** is correct

## 📈 Future Enhancements

Potential improvements:
- [ ] Add user authentication
- [ ] Support for different Notion databases
- [ ] Message formatting options
- [ ] Bulk message import
- [ ] Analytics dashboard

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Railway deployment logs
3. Verify Slack app configuration
4. Test Notion database permissions

---

**Status**: ✅ Production Ready | **Last Updated**: July 20, 2025 