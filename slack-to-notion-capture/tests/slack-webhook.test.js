const request = require('supertest');
const express = require('express');
const notionHandler = require('../src/notion-handler');
const slackWebhook = require('../src/slack-webhook');

jest.mock('../src/notion-handler');

const app = express();
app.use(express.json());
app.use('/', slackWebhook);

describe('Slack Webhook', () => {
  it('should respond to test endpoint', async () => {
    const res = await request(app).get('/slack/test');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('Slack webhook is up and running!');
  });

  it('should ignore irrelevant Slack events', async () => {
    const res = await request(app)
      .post('/slack/webhook')
      .send({ event: { bot_id: 'B123', text: 'Hello' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('Ignored');
  });

  it('should call Notion handler for valid messages', async () => {
    notionHandler.sendToNotion.mockResolvedValue(true);
    const res = await request(app)
      .post('/slack/webhook')
      .send({ event: { text: 'urgent newsreel', user: 'U123', ts: '12345' } });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('Captured');
    expect(notionHandler.sendToNotion).toHaveBeenCalledWith('urgent newsreel');
  });

  it('should handle Notion errors gracefully', async () => {
    notionHandler.sendToNotion.mockRejectedValue(new Error('Notion error'));
    const res = await request(app)
      .post('/slack/webhook')
      .send({ event: { text: 'urgent newsreel', user: 'U123', ts: '12345' } });
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Failed to capture message');
  });
});

describe('Keyword Detection', () => {
  const { detectContentType, detectPriority, extractKeywords } = require('../src/notion-handler');
  it('detects content type', () => {
    expect(detectContentType('newsreel update')).toBe('Newsreel');
    expect(detectContentType('freelance tool')).toBe('Freelance');
    expect(detectContentType('zine drawing')).toBe('Personal');
    expect(detectContentType('random message')).toBe('Random');
  });
  it('detects priority', () => {
    expect(detectPriority('urgent deadline')).toBe('High');
    expect(detectPriority('normal message')).toBe('Normal');
  });
  it('extracts keywords', () => {
    expect(extractKeywords('urgent newsreel tool')).toEqual(
      expect.arrayContaining(['urgent', 'newsreel', 'tool'])
    );
  });
}); 