# Slack to Notion Content Capture

A serverless webhook tool to capture Slack messages and send them to a Notion database, with auto-tagging, keyword extraction, and robust error handling. Deployable on Vercel as part of a monorepo or standalone.

**🚀 Status: DEPLOYED & WORKING**
- **Live URL**: https://slack-to-notion-capture-katies-projects-4f5ab601.vercel.app
- **Webhook Endpoint**: `/api/webhook`
- **Health Check**: `/api/health`
- **Debug Info**: `/api/debug`

---

## Features
- ✅ Receives Slack webhooks and validates requests
- ✅ Extracts message content, timestamp, and user info
- ✅ Filters out bot messages and irrelevant content
- ✅ Auto-tags and classifies messages by keywords
- ✅ Sends formatted data to a Notion database
- ✅ Handles errors and retries
- ✅ Includes health check and CORS support
- ✅ Rate limiting and security headers
- ✅ Fully tested with Jest
- ✅ **NEW**: Fixed database schema compatibility
- ✅ **NEW**: Enhanced error handling and logging
- ✅ **NEW**: Debug endpoint for troubleshooting

---

## Recent Fixes (July 2025)
- **Fixed database schema mismatch** - Updated webhook to use correct Notion properties
- **Added proper Slack signature validation** - Enhanced security with optional validation
- **Improved error handling** - Better logging and debugging capabilities
- **Created debug endpoint** - Real-time system status and database info
- **Fixed deployment issues** - Proper environment variable configuration

---

## Directory Structure

```
slack-to-notion-capture/
├── api/
│   ├── webhook.js         # Vercel serverless function for Slack webhooks
│   ├── health.js          # Vercel serverless function for health checks
│   ├── debug.js           # Debug endpoint for system status
│   └── notion-test.js     # Notion connection testing
├── src/
│   ├── notion-handler.js  # Notion API logic
│   ├── message-processor.js # Keyword/tag logic
│   └── slack-webhook.js   # Express version (for local/dev)
├── tests/
│   └── slack-webhook.test.js # Jest test suite
├── test-webhook.js        # Local testing script
├── vercel.json            # Vercel config
├── package.json           # Project dependencies and scripts
└── README.md              # This file
```

---

## Setup

### 1. Clone the Repo
```bash
git clone https://github.com/ktoepp/api-modules.git
cd api-modules/slack-to-notion-capture
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file (for local dev) or set these in Vercel:
```
NOTION_API_KEY=your_notion_secret
NOTION_DATABASE_ID=your_notion_database_id
SLACK_WEBHOOK_SECRET=your_slack_signing_secret
```

---

## Deployment (Vercel)

1. **Push to GitHub** (if not already):
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```
2. **Import your repo on [Vercel](https://vercel.com/import)**
3. **Set environment variables** in the Vercel dashboard:
   - `NOTION_API_KEY`
   - `NOTION_DATABASE_ID`
   - `SLACK_WEBHOOK_SECRET`
4. **Deploy!**

### Webhook Endpoints
- **Slack Webhook:** `https://<your-vercel-project>.vercel.app/api/webhook`
- **Health Check:** `https://<your-vercel-project>.vercel.app/api/health`
- **Debug Info:** `https://<your-vercel-project>.vercel.app/api/debug`

---

## Slack App Setup
1. Go to your Slack app settings → **Event Subscriptions**
2. Enable events and set the Request URL to your deployed webhook endpoint
3. Subscribe to `message.channels` for your content capture channel
4. Use your Slack **Signing Secret** for `SLACK_WEBHOOK_SECRET`

---

## Notion Setup
1. Create a Notion integration and share your database with it
2. Get your integration token (`NOTION_API_KEY`) and database ID (`NOTION_DATABASE_ID`)
3. Database must have these properties:
   - `Meeting Title` (title)
   - `Notes` (rich_text)
   - `Date` (date)
   - `Meeting Type` (select)
   - `Project` (relation)
   - `Action Items` (rich_text)
   - `Attendees` (people)
   - `Duration (mins)` (number)

---

## Testing

### Run the test suite:
```bash
npm test
```

### Test Notion connection locally:
```bash
node test-webhook.js
```

### Test deployed endpoints:
```bash
# Health check
curl https://slack-to-notion-capture-katies-projects-4f5ab601.vercel.app/api/health

# Debug info
curl https://slack-to-notion-capture-katies-projects-4f5ab601.vercel.app/api/debug
```

---

## Local Development

You can run the Express version for local testing:
```bash
node src/slack-webhook.js
```

---

## Troubleshooting

### Common Issues:
1. **"Title is not a property that exists"** - Make sure your Notion database has the correct property names
2. **"Invalid request signature"** - Check your `SLACK_WEBHOOK_SECRET` is set correctly
3. **"Notion API error"** - Verify your `NOTION_API_KEY` and `NOTION_DATABASE_ID`

### Debug Endpoint:
Visit `/api/debug` to see:
- Environment variable status
- Notion connection status
- Database properties and types
- Recent errors

---

## License
MIT 