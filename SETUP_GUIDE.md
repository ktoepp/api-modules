# Quick Setup Guide - Slack to Notion Integration

This guide will get your Slack to Notion integration running in 10 minutes.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
npm install -g pm2
```

### 2. Set Environment Variables
Create `.env` file:
```bash
NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=your_notion_database_id
SLACK_SIGNING_SECRET=your_slack_signing_secret
```

### 3. Start the Server
```bash
pm2 start ecosystem.config.js
pm2 save
```

### 4. Configure Slack App
1. Go to https://api.slack.com/apps
2. Create new app or use existing
3. Add slash command `/ntn`
4. Set request URL to: `https://your-domain.com/api/slash-command`
5. Install app to workspace

### 5. Configure Notion
1. Create integration at https://www.notion.so/my-integrations
2. Share your database with the integration
3. Ensure database has: Title, Content, Date properties

### 6. Test
Use `/ntn test message` in Slack!

## 🔧 Configuration Details

### Notion Database Properties
Your database must have these exact properties:
- **Title** (title type) - Required
- **Content** (rich_text type) - Message content
- **Date** (date type) - Creation date

### Slack App Scopes
Required scopes:
- `commands` - For slash commands
- `chat:write` - To send responses

### PM2 Management
```bash
# Check status
pm2 status

# View logs
pm2 logs slack-to-notion

# Restart
pm2 restart slack-to-notion
```

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| "Name is not a property" | Check database property names |
| "Database not found" | Share database with integration |
| "Invalid signature" | Verify Slack signing secret |
| Server won't start | Check port 3000 is available |

## 📞 Need Help?

1. Check PM2 logs: `pm2 logs slack-to-notion`
2. Test health: `curl http://localhost:3000/health`
3. Verify environment variables are set
4. Check Slack app configuration

---

**Status**: ✅ Ready to use!  
**Time to Setup**: ~10 minutes 