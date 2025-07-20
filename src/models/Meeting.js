const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  googleEventId: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  attendees: [String],
  meetingUrl: String,
  meetingPlatform: { type: String, enum: ['zoom', 'meet', 'teams', 'in-person', 'other'] },
  status: {
    type: String,
    enum: ['pending', 'synced', 'bot_invited', 'recording', 'completed', 'failed'],
    default: 'pending'
  },
  botInvited: { type: Boolean, default: false },
  botInviteTime: Date,
  recordingUrl: String,
  notionPageId: String,
  summary: String,
  appliedRules: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Rule' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Meeting', meetingSchema);
