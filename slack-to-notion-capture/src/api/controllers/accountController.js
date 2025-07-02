// src/api/controllers/accountController.js
const { GoogleAuthService } = require('../../services/integrations/google/authService');
const Account = require('../../models/Account');
const MeetingProcessor = require('../../services/core/meetingProcessor');
const logger = require('../../services/utils/logger');

class AccountController {
  constructor() {
    this.googleAuth = new GoogleAuthService();
    this.meetingProcessor = new MeetingProcessor();
  }

  async getAccounts(req, res) {
    try {
      const { userId } = req.user;
      const accounts = await Account.find({ userId }).select('-tokens');
      res.json({ accounts });
    } catch (error) {
      logger.error('Error fetching accounts:', error);
      res.status(500).json({ error: 'Failed to fetch accounts' });
    }
  }

  async addGoogleAccount(req, res) {
    try {
      const { userId } = req.user;
      const authUrl = this.googleAuth.getAuthUrl(userId);
      res.json({ authUrl });
    } catch (error) {
      logger.error('Error generating auth URL:', error);
      res.status(500).json({ error: 'Failed to generate auth URL' });
    }
  }

  async handleGoogleCallback(req, res) {
    try {
      const { code, state: userId } = req.query;
      
      if (!code || !userId) {
        return res.status(400).json({ error: 'Missing authorization code or user ID' });
      }

      const tokens = await this.googleAuth.exchangeCodeForTokens(code);
      
      // Get user email from Google
      this.googleAuth.oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2('v2');
      const userInfo = await oauth2.userinfo.get({ auth: this.googleAuth.oauth2Client });
      
      const account = await this.googleAuth.saveAccountTokens(
        userInfo.data.email,
        tokens,
        userId
      );

      // Start processing meetings for this account
      this.meetingProcessor.processAccountMeetings(account._id).catch(error => {
        logger.error(`Background processing error for account ${account._id}:`, error);
      });

      res.json({ 
        message: 'Account connected successfully',
        account: { 
          id: account._id,
          email: account.email,
          provider: account.provider
        }
      });
    } catch (error) {
      logger.error('Error handling Google callback:', error);
      res.status(500).json({ error: 'Failed to connect account' });
    }
  }

  async removeAccount(req, res) {
    try {
      const { userId } = req.user;
      const { accountId } = req.params;

      const account = await Account.findOneAndDelete({ 
        _id: accountId, 
        userId 
      });

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      res.json({ message: 'Account removed successfully' });
    } catch (error) {
      logger.error('Error removing account:', error);
      res.status(500).json({ error: 'Failed to remove account' });
    }
  }

  async toggleAccount(req, res) {
    try {
      const { userId } = req.user;
      const { accountId } = req.params;
      const { isActive } = req.body;

      const account = await Account.findOneAndUpdate(
        { _id: accountId, userId },
        { isActive },
        { new: true }
      ).select('-tokens');

      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      res.json({ account });
    } catch (error) {
      logger.error('Error toggling account:', error);
      res.status(500).json({ error: 'Failed to toggle account' });
    }
  }

  async syncAccount(req, res) {
    try {
      const { userId } = req.user;
      const { accountId } = req.params;

      const account = await Account.findOne({ _id: accountId, userId });
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      await this.meetingProcessor.processAccountMeetings(accountId);
      
      res.json({ message: 'Account sync completed' });
    } catch (error) {
      logger.error('Error syncing account:', error);
      res.status(500).json({ error: 'Failed to sync account' });
    }
  }
}

// src/api/controllers/meetingController.js
const Meeting = require('../../models/Meeting');
const MeetingProcessor = require('../../services/core/meetingProcessor');
const logger = require('../../services/utils/logger');

class MeetingController {
  constructor() {
    this.meetingProcessor = new MeetingProcessor();
  }

  async getMeetings(req, res) {
    try {
      const { userId } = req.user;
      const { 
        accountId, 
        status, 
        startDate, 
        endDate, 
        page = 1, 
        limit = 20 
      } = req.query;

      const query = {};
      
      // Filter by account (must belong to user)
      if (accountId) {
        const Account = require('../../models/Account');
        const account = await Account.findOne({ _id: accountId, userId });
        if (!account) {
          return res.status(403).json({ error: 'Access denied to this account' });
        }
        query.accountId = accountId;
      } else {
        // Get all user's accounts
        const Account = require('../../models/Account');
        const accounts = await Account.find({ userId }).select('_id');
        query.accountId = { $in: accounts.map(a => a._id) };
      }

      if (status) query.status = status;
      
      if (startDate || endDate) {
        query.startTime = {};
        if (startDate) query.startTime.$gte = new Date(startDate);
        if (endDate) query.startTime.$lte = new Date(endDate);
      }

      const meetings = await Meeting.find(query)
        .populate('accountId', 'email provider')
        .populate('appliedRules', 'name description')
        .sort({ startTime: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Meeting.countDocuments(query);

      res.json({
        meetings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching meetings:', error);
      res.status(500).json({ error: 'Failed to fetch meetings' });
    }
  }

  async getMeeting(req, res) {
    try {
      const { userId } = req.user;
      const { meetingId } = req.params;

      const meeting = await Meeting.findById(meetingId)
        .populate('accountId', 'email provider userId')
        .populate('appliedRules', 'name description conditions actions');

      if (!meeting || meeting.accountId.userId !== userId) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      res.json({ meeting });
    } catch (error) {
      logger.error('Error fetching meeting:', error);
      res.status(500).json({ error: 'Failed to fetch meeting' });
    }
  }

  async inviteBotToMeeting(req, res) {
    try {
      const { userId } = req.user;
      const { meetingId } = req.params;

      const meeting = await Meeting.findById(meetingId).populate('accountId');
      
      if (!meeting || meeting.accountId.userId !== userId) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      if (meeting.botInvited) {
        return res.status(400).json({ error: 'Bot already invited to this meeting' });
      }

      await this.meetingProcessor.inviteBotToMeeting(meeting);

      const updatedMeeting = await Meeting.findById(meetingId);
      res.json({ 
        message: 'Bot invited successfully',
        meeting: updatedMeeting
      });
    } catch (error) {
      logger.error('Error inviting bot to meeting:', error);
      res.status(500).json({ error: 'Failed to invite bot' });
    }
  }

  async getUpcomingMeetings(req, res) {
    try {
      const { userId } = req.user;
      const { hours = 24 } = req.query;

      // Get all user accounts
      const Account = require('../../models/Account');
      const accounts = await Account.find({ userId, isActive: true });

      const allUpcomingMeetings = [];
      
      for (const account of accounts) {
        const meetings = await this.meetingProcessor.getUpcomingMeetings(
          account._id, 
          parseInt(hours)
        );
        allUpcomingMeetings.push(...meetings);
      }

      // Sort by start time
      allUpcomingMeetings.sort((a, b) => a.startTime - b.startTime);

      res.json({ meetings: allUpcomingMeetings });
    } catch (error) {
      logger.error('Error fetching upcoming meetings:', error);
      res.status(500).json({ error: 'Failed to fetch upcoming meetings' });
    }
  }

  async updateMeetingStatus(req, res) {
    try {
      const { userId } = req.user;
      const { meetingId } = req.params;
      const { status, recordingUrl, summary, notionPageId } = req.body;

      const meeting = await Meeting.findById(meetingId).populate('accountId');
      
      if (!meeting || meeting.accountId.userId !== userId) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      const updateData = { status, updatedAt: new Date() };
      if (recordingUrl) updateData.recordingUrl = recordingUrl;
      if (summary) updateData.summary = summary;
      if (notionPageId) updateData.notionPageId = notionPageId;

      const updatedMeeting = await Meeting.findByIdAndUpdate(
        meetingId,
        updateData,
        { new: true }
      );

      res.json({ meeting: updatedMeeting });
    } catch (error) {
      logger.error('Error updating meeting status:', error);
      res.status(500).json({ error: 'Failed to update meeting' });
    }
  }
}

// src/api/controllers/rulesController.js
const Rule = require('../../models/Rule');
const Account = require('../../models/Account');
const RuleEngine = require('../../services/core/ruleEngine');
const logger = require('../../services/utils/logger');

class RulesController {
  constructor() {
    this.ruleEngine = new RuleEngine();
  }

  async getRules(req, res) {
    try {
      const { userId } = req.user;
      const { accountId } = req.query;

      let query = {};
      
      if (accountId) {
        // Verify account belongs to user
        const account = await Account.findOne({ _id: accountId, userId });
        if (!account) {
          return res.status(403).json({ error: 'Access denied to this account' });
        }
        query = { $or: [{ accountId }, { isGlobal: true }] };
      } else {
        // Get all user's account IDs
        const accounts = await Account.find({ userId }).select('_id');
        const accountIds = accounts.map(a => a._id);
        query = { 
          $or: [
            { accountId: { $in: accountIds } },
            { isGlobal: true }
          ]
        };
      }

      const rules = await Rule.find(query)
        .populate('accountId', 'email provider')
        .sort({ priority: -1, createdAt: -1 });

      res.json({ rules });
    } catch (error) {
      logger.error('Error fetching rules:', error);
      res.status(500).json({ error: 'Failed to fetch rules' });
    }
  }

  async createRule(req, res) {
    try {
      const { userId } = req.user;
      const ruleData = req.body;

      // Validate account ownership if not global
      if (ruleData.accountId && !ruleData.isGlobal) {
        const account = await Account.findOne({ 
          _id: ruleData.accountId, 
          userId 
        });
        if (!account) {
          return res.status(403).json({ error: 'Access denied to this account' });
        }
      }

      const rule = new Rule(ruleData);
      await rule.save();

      // Clear rule cache
      this.ruleEngine.clearCache(ruleData.accountId);

      res.status(201).json({ rule });
    } catch (error) {
      logger.error('Error creating rule:', error);
      res.status(500).json({ error: 'Failed to create rule' });
    }
  }

  async updateRule(req, res) {
    try {
      const { userId } = req.user;
      const { ruleId } = req.params;
      const updateData = req.body;

      // Find rule and verify ownership
      const rule = await Rule.findById(ruleId).populate('accountId');
      
      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      if (!rule.isGlobal && rule.accountId.userId !== userId) {
        return res.status(403).json({ error: 'Access denied to this rule' });
      }

      const updatedRule = await Rule.findByIdAndUpdate(
        ruleId,
        { ...updateData, updatedAt: new Date() },
        { new: true }
      ).populate('accountId', 'email provider');

      // Clear rule cache
      this.ruleEngine.clearCache(rule.accountId?._id);

      res.json({ rule: updatedRule });
    } catch (error) {
      logger.error('Error updating rule:', error);
      res.status(500).json({ error: 'Failed to update rule' });
    }
  }

  async deleteRule(req, res) {
    try {
      const { userId } = req.user;
      const { ruleId } = req.params;

      const rule = await Rule.findById(ruleId).populate('accountId');
      
      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      if (!rule.isGlobal && rule.accountId.userId !== userId) {
        return res.status(403).json({ error: 'Access denied to this rule' });
      }

      await Rule.findByIdAndDelete(ruleId);

      // Clear rule cache
      this.ruleEngine.clearCache(rule.accountId?._id);

      res.json({ message: 'Rule deleted successfully' });
    } catch (error) {
      logger.error('Error deleting rule:', error);
      res.status(500).json({ error: 'Failed to delete rule' });
    }
  }

  async testRule(req, res) {
    try {
      const { userId } = req.user;
      const { ruleId } = req.params;
      const { meetingId } = req.body;

      const rule = await Rule.findById(ruleId).populate('accountId');
      
      if (!rule) {
        return res.status(404).json({ error: 'Rule not found' });
      }

      if (!rule.isGlobal && rule.accountId.userId !== userId) {
        return res.status(403).json({ error: 'Access denied to this rule' });
      }

      const meeting = await Meeting.findById(meetingId).populate('accountId');
      
      if (!meeting || meeting.accountId.userId !== userId) {
        return res.status(404).json({ error: 'Meeting not found' });
      }

      const matches = await this.ruleEngine.evaluateRule(rule, meeting);

      res.json({ 
        matches,
        rule: {
          name: rule.name,
          conditions: rule.conditions
        },
        meeting: {
          title: meeting.title,
          startTime: meeting.startTime,
          attendees: meeting.attendees.length,
          platform: meeting.meetingPlatform
        }
      });
    } catch (error) {
      logger.error('Error testing rule:', error);
      res.status(500).json({ error: 'Failed to test rule' });
    }
  }
}

module.exports = { AccountController, MeetingController, RulesController };