require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATABASE_ID;

// Keyword maps for content type and priority
const CONTENT_TYPE_KEYWORDS = {
  Newsreel: ["newsreel", "polling", "dashboard"],
  Freelance: ["freelance", "calculator", "tool"],
  Personal: ["zine", "analog", "drawing"],
};
const PRIORITY_KEYWORDS = {
  High: ["urgent", "deadline", "launching"],
};

function detectContentType(message) {
  const lower = message.toLowerCase();
  for (const [type, keywords] of Object.entries(CONTENT_TYPE_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return type;
  }
  return "Random";
}

function detectPriority(message) {
  const lower = message.toLowerCase();
  for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return priority;
  }
  return "Normal";
}

function extractKeywords(message) {
  // Extract all unique keywords from all maps that are present in the message
  const lower = message.toLowerCase();
  const allKeywords = [
    ...Object.values(CONTENT_TYPE_KEYWORDS).flat(),
    ...Object.values(PRIORITY_KEYWORDS).flat(),
  ];
  return [...new Set(allKeywords.filter(k => lower.includes(k)))];
}

function buildNotionProperties(message) {
  return {
    "Title": {
      title: [
        {
          text: {
            content: message.slice(0, 50),
          },
        },
      ],
    },
    "Raw Content": {
      rich_text: [
        {
          text: {
            content: message,
          },
        },
      ],
    },
    "Content Type": {
      select: {
        name: detectContentType(message),
      },
    },
    "Priority": {
      select: {
        name: detectPriority(message),
      },
    },
    "Keywords": {
      multi_select: extractKeywords(message).map(k => ({ name: k })),
    },
    "Status": {
      select: {
        name: "Captured",
      },
    },
  };
}

async function sendToNotion(message, maxRetries = 3) {
  const properties = buildNotionProperties(message);
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties,
      });
      return true;
    } catch (error) {
      attempt++;
      console.error(`Error sending to Notion (attempt ${attempt}):`, error.message);
      if (attempt >= maxRetries) throw error;
      await new Promise(res => setTimeout(res, 1000 * attempt)); // Exponential backoff
    }
  }
}

module.exports = { sendToNotion, buildNotionProperties, detectContentType, detectPriority, extractKeywords }; 