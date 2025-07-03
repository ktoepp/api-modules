let notionStatus = { connected: false, lastChecked: null, lastError: null };
let webhookLogs = [];
let errorLogs = [];

function setNotionStatus(status) {
  notionStatus = { ...notionStatus, ...status, lastChecked: new Date().toISOString() };
}
function getNotionStatus() {
  return notionStatus;
}
function logWebhookAttempt(data) {
  webhookLogs.push({ ...data, timestamp: new Date().toISOString() });
  if (webhookLogs.length > 20) webhookLogs.shift();
}
function getWebhookLogs() {
  return webhookLogs;
}
function logError(error) {
  errorLogs.push({ error, timestamp: new Date().toISOString() });
  if (errorLogs.length > 20) errorLogs.shift();
}
function getErrorLogs() {
  return errorLogs;
}

module.exports = { setNotionStatus, getNotionStatus, logWebhookAttempt, getWebhookLogs, logError, getErrorLogs }; 