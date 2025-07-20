const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  provider: { type: String, required: true }, // 'google', 'outlook', etc.
  tokens: {
    accessToken: { type: String, required: true },
    refreshToken: { type: String, required: true },
    expiryDate: { type: Date, required: true }
  },
  calendarId: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  settings: {
    autoInviteBot: { type: Boolean, default: true },
    defaultRules: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Rule' }]
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Account', accountSchema);
