const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
  isGlobal: { type: Boolean, default: false },
  conditions: {
    minDuration: Number, // in minutes
    maxDuration: Number,
    minAttendees: Number,
    maxAttendees: Number,
    titleKeywords: [String],
    titleExclusions: [String],
    attendeeKeywords: [String],
    timeOfDay: {
      start: String, // "HH:MM"
      end: String
    },
    daysOfWeek: [Number], // 0-6, Sunday=0
    requiredPlatforms: [String]
  },
  actions: {
    inviteBot: { type: Boolean, default: true },
    notifyUser: { type: Boolean, default: false },
    customMessage: String
  },
  priority: { type: Number, default: 1 }, // Higher = more priority
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Rule', ruleSchema);
