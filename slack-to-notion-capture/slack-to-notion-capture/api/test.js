const { sendToNotion } = require('../src/notion-handler');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  console.log('[TEST ENDPOINT] Received:', body);
  try {
    const result = await sendToNotion(body.testMessage || 'Test message from /api/test endpoint');
    console.log('[TEST ENDPOINT] Notion result:', result);
    return res.status(200).json({ status: 'success', notionResult: result });
  } catch (err) {
    console.error('[TEST ENDPOINT] Notion error:', err);
    return res.status(500).json({ status: 'error', error: err.message });
  }
}; 