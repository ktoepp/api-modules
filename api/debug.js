const { getNotionStatus, getWebhookLogs, getErrorLogs } = require('../src/log-state');

module.exports = (req, res) => {
  const envVars = [
    'NOTION_API_KEY',
    'NOTION_DATABASE_ID',
    'SLACK_WEBHOOK_SECRET',
  ];
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.status(200).json({
    envVarsLoaded: envVars.filter(v => !!process.env[v]),
    notionStatus: getNotionStatus(),
    recentWebhookAttempts: getWebhookLogs(),
    errorLogs: getErrorLogs(),
  });
}; 