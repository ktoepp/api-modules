# Deployment Guide - Slack to Notion Integration

This guide covers deploying your Slack to Notion integration to different hosting platforms.

## 🏠 Local Development (Recommended for Testing)

### Prerequisites
- Node.js 18+
- PM2 (for process management)

### Setup
```bash
# Install dependencies
npm install
npm install -g pm2

# Set environment variables in .env
NOTION_API_KEY=your_key
NOTION_DATABASE_ID=your_database_id
SLACK_SIGNING_SECRET=your_secret

# Start with PM2
pm2 start ecosystem.config.js
pm2 save

# Check status
pm2 status
```

### Access URLs
- **Health Check**: http://localhost:3000/health
- **Slack Endpoint**: http://localhost:3000/api/slash-command
- **Test Endpoint**: http://localhost:3000/api/test-slash

## ☁️ Vercel Deployment

### Prerequisites
- Vercel account
- GitHub repository

### Setup
```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Configuration
1. **Set Environment Variables** in Vercel Dashboard:
   - `NOTION_API_KEY`
   - `NOTION_DATABASE_ID`
   - `SLACK_SIGNING_SECRET`

2. **Disable Authentication**:
   - Go to Vercel Dashboard → Project Settings → Security
   - Disable "Password Protection"

3. **Update Slack App**:
   - Set Request URL to: `https://your-project.vercel.app/api/slash-command`

### Pros & Cons
✅ **Pros**: Easy deployment, automatic HTTPS, good free tier  
❌ **Cons**: Authentication issues with Slack, cold starts

## 🚂 Railway Deployment

### Prerequisites
- Railway account
- Railway CLI

### Setup
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Set environment variables
railway variables set NOTION_API_KEY=your_key
railway variables set NOTION_DATABASE_ID=your_database_id
railway variables set SLACK_SIGNING_SECRET=your_secret

# Deploy
railway up
```

### Configuration
1. **Update Slack App**:
   - Set Request URL to your Railway domain
   - Format: `https://your-project.railway.app/api/slash-command`

### Pros & Cons
✅ **Pros**: No authentication issues, reliable, good free tier  
❌ **Cons**: Requires CLI setup

## 🎯 Render Deployment

### Prerequisites
- Render account
- GitHub repository

### Setup
1. **Connect Repository**:
   - Go to Render Dashboard
   - Click "New Web Service"
   - Connect your GitHub repo

2. **Configure Service**:
   - **Name**: `slack-to-notion`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/slash-command-server.js`

3. **Set Environment Variables**:
   - `NOTION_API_KEY`
   - `NOTION_DATABASE_ID`
   - `SLACK_SIGNING_SECRET`

4. **Deploy**

### Configuration
- **Update Slack App** with Render URL
- **Health Check**: `https://your-service.onrender.com/health`

### Pros & Cons
✅ **Pros**: Simple setup, no authentication issues  
❌ **Cons**: Free tier has limitations

## 🐳 Docker Deployment

### Prerequisites
- Docker installed
- Docker Compose (optional)

### Setup
```bash
# Build image
docker build -t slack-to-notion .

# Run container
docker run -d \
  --name slack-to-notion \
  -p 3000:3000 \
  -e NOTION_API_KEY=your_key \
  -e NOTION_DATABASE_ID=your_database_id \
  -e SLACK_SIGNING_SECRET=your_secret \
  slack-to-notion
```

### Docker Compose
```yaml
version: '3.8'
services:
  slack-to-notion:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NOTION_API_KEY=${NOTION_API_KEY}
      - NOTION_DATABASE_ID=${NOTION_DATABASE_ID}
      - SLACK_SIGNING_SECRET=${SLACK_SIGNING_SECRET}
    restart: unless-stopped
```

## 🔧 Environment Variables

All deployments require these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `NOTION_API_KEY` | Notion integration token | `secret_abc123...` |
| `NOTION_DATABASE_ID` | Target database ID | `abc123def456...` |
| `SLACK_SIGNING_SECRET` | Slack app signing secret | `abc123def456...` |

## 🔍 Health Monitoring

### Health Check Endpoint
All deployments provide a health check at `/health`:

```bash
curl https://your-domain.com/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-07-20T05:38:52.404Z",
  "environment": {
    "notionApiKey": true,
    "notionDatabaseId": true,
    "slackSigningSecret": true
  }
}
```

### Monitoring Commands
```bash
# Check application status
curl https://your-domain.com/health

# Test Notion connectivity
curl https://your-domain.com/api/test-slash

# View logs (platform specific)
# Vercel: Dashboard → Functions → View Logs
# Railway: railway logs
# Render: Dashboard → Logs
```

## 🚨 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Authentication Required" | Disable Vercel authentication |
| "Invalid signature" | Check Slack signing secret |
| "Database not found" | Verify Notion database ID |
| "Port already in use" | Change port in environment |

### Debug Steps
1. Check health endpoint
2. Verify environment variables
3. Test Notion connectivity
4. Check Slack app configuration
5. Review platform logs

## 📊 Performance Comparison

| Platform | Setup Time | Reliability | Cost | Slack Compatible |
|----------|------------|-------------|------|------------------|
| Local + PM2 | 5 min | ⭐⭐⭐⭐⭐ | Free | ✅ |
| Railway | 10 min | ⭐⭐⭐⭐⭐ | Free tier | ✅ |
| Render | 15 min | ⭐⭐⭐⭐ | Free tier | ✅ |
| Vercel | 5 min | ⭐⭐⭐ | Free tier | ❌ (auth issues) |

## 🎯 Recommendation

**For Production**: Use **Railway** or **Local + PM2**  
**For Development**: Use **Local + PM2**  
**For Quick Testing**: Use **Render**

---

**Status**: ✅ All deployment options tested  
**Last Updated**: July 2025 