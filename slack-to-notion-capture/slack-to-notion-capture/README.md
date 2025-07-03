# Slack to Notion Content Capture

A serverless webhook tool to capture Slack messages and send them to a Notion database, with auto-tagging, keyword extraction, and robust error handling. Deployable on Vercel as part of a monorepo or standalone.

---

## Features
- Receives Slack webhooks and validates requests
- Extracts message content, timestamp, and user info
- Filters out bot messages and irrelevant content
- Auto-tags and classifies messages by keywords
- Sends formatted data to a Notion database
- Handles errors and retries
- Includes health check and CORS support
- Rate limiting and security headers
- Fully tested with Jest

---

## Directory Structure

```
slack-to-notion-capture/
├── api/
│   ├── webhook.js         # Vercel serverless function for Slack webhooks
│   └── health.js          # Vercel serverless function for health checks
├── src/
│   ├── notion-handler.js  # Notion API logic
│   ├── message-processor.js # Keyword/tag logic
│   └── slack-webhook.js   # Express version (for local/dev)
├── tests/
│   └── slack-webhook.test.js # Jest test suite
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
   - `Title` (title)
   - `Raw Content` (rich_text)
   - `Content Type` (select)
   - `Priority` (select)
   - `Keywords` (multi_select)
   - `Status` (select)

---

## Testing

Run the test suite:
```bash
npm test
```

---

## Local Development

You can run the Express version for local testing:
```bash
node src/slack-webhook.js
```

---

## License
MIT 