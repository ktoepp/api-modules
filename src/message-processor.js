function autoTagMessage(message) {
  const tags = [];
  const keywordTagMap = {
    urgent: 'Urgent',
    meeting: 'Meeting',
    action: 'Action Item',
    note: 'Note',
  };
  for (const keyword in keywordTagMap) {
    if (message.toLowerCase().includes(keyword)) {
      tags.push(keywordTagMap[keyword]);
    }
  }
  return tags;
}

function formatForNotion(message) {
  const tags = autoTagMessage(message);
  return {
    Name: {
      title: [
        {
          text: {
            content: message,
          },
        },
      ],
    },
    Tags: {
      multi_select: tags.map(tag => ({ name: tag })),
    },
  };
}

module.exports = { autoTagMessage, formatForNotion }; 