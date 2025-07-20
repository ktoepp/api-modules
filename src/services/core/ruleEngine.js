// src/services/core/ruleEngine.js
const Rule = require('../../models/Rule');
const moment = require('moment-timezone');

class RuleEngine {
  constructor() {
    this.cachedRules = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  async evaluateMeeting(meeting, accountId) {
    const rules = await this.getRulesForAccount(accountId);
    const applicableRules = [];

    for (const rule of rules) {
      if (await this.evaluateRule(rule, meeting)) {
        applicableRules.push(rule);
      }
    }

    // Sort by priority (higher first)
    applicableRules.sort((a, b) => b.priority - a.priority);
    
    return applicableRules;
  }

  async getRulesForAccount(accountId) {
    const cacheKey = `rules_${accountId}`;
    const cached = this.cachedRules.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.rules;
    }

    const rules = await Rule.find({
      $or: [
        { accountId: accountId, isActive: true },
        { isGlobal: true, isActive: true }
      ]
    }).sort({ priority: -1 });

    this.cachedRules.set(cacheKey, {
      rules,
      timestamp: Date.now()
    });

    return rules;
  }

  async evaluateRule(rule, meeting) {
    const conditions = rule.conditions;
    
    // Duration check
    if (conditions.minDuration || conditions.maxDuration) {
      const duration = moment(meeting.endTime).diff(moment(meeting.startTime), 'minutes');
      if (conditions.minDuration && duration < conditions.minDuration) return false;
      if (conditions.maxDuration && duration > conditions.maxDuration) return false;
    }

    // Attendee count check
    if (conditions.minAttendees || conditions.maxAttendees) {
      const attendeeCount = meeting.attendees.length;
      if (conditions.minAttendees && attendeeCount < conditions.minAttendees) return false;
      if (conditions.maxAttendees && attendeeCount > conditions.maxAttendees) return false;
    }

    // Title keyword check
    if (conditions.titleKeywords && conditions.titleKeywords.length > 0) {
      const titleLower = meeting.title.toLowerCase();
      const hasKeyword = conditions.titleKeywords.some(keyword => 
        titleLower.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) return false;
    }

    // Title exclusion check
    if (conditions.titleExclusions && conditions.titleExclusions.length > 0) {
      const titleLower = meeting.title.toLowerCase();
      const hasExclusion = conditions.titleExclusions.some(exclusion => 
        titleLower.includes(exclusion.toLowerCase())
      );
      if (hasExclusion) return false;
    }

    // Attendee keyword check
    if (conditions.attendeeKeywords && conditions.attendeeKeywords.length > 0) {
      const attendeeEmails = meeting.attendees.join(' ').toLowerCase();
      const hasAttendeeKeyword = conditions.attendeeKeywords.some(keyword => 
        attendeeEmails.includes(keyword.toLowerCase())
      );
      if (!hasAttendeeKeyword) return false;
    }

    // Time of day check
    if (conditions.timeOfDay && conditions.timeOfDay.start && conditions.timeOfDay.end) {
      const meetingTime = moment(meeting.startTime).format('HH:mm');
      if (meetingTime < conditions.timeOfDay.start || meetingTime > conditions.timeOfDay.end) {
        return false;
      }
    }

    // Days of week check
    if (conditions.daysOfWeek && conditions.daysOfWeek.length > 0) {
      const meetingDay = moment(meeting.startTime).day();
      if (!conditions.daysOfWeek.includes(meetingDay)) return false;
    }

    // Platform check
    if (conditions.requiredPlatforms && conditions.requiredPlatforms.length > 0) {
      if (!conditions.requiredPlatforms.includes(meeting.meetingPlatform)) return false;
    }

    return true;
  }

  clearCache(accountId = null) {
    if (accountId) {
      this.cachedRules.delete(`rules_${accountId}`);
    } else {
      this.cachedRules.clear();
    }
  }
}

// src/services/core/meetingProcessor.js
const { GoogleCalendarService } = require('../integrations/google/calendarService');
const NotionService = require('../integrations/notion/notionService');
const RuleEngine = require('./ruleEngine');
const Meeting = require('../../models/Meeting');
const Account = require('../../models/Account');
const logger = require('../utils/logger');

class MeetingProcessor {
  constructor() {
    this.googleCalendar = new GoogleCalendarService();
    this.notionService = new NotionService();
    this.ruleEngine = new RuleEngine();
    this.processing = new Set(); // Prevent duplicate processing
  }

  async processAccountMeetings(accountId) {
    if (this.processing.has(accountId)) {
      logger.info(`Already processing meetings for account ${accountId}`);
      return;
    }

    this.processing.add(accountId);
    
    try {
      logger.info(`Processing meetings for account ${accountId}`);
      
      // Get all meetings from Google Calendar
      const meetings = await this.googleCalendar.processMeetingEvents(accountId);
      
      // Process each meeting through rule engine
      for (const meeting of meetings) {
        await this.processSingleMeeting(meeting);
      }
      
      logger.info(`Processed ${meetings.length} meetings for account ${accountId}`);
    } catch (error) {
      logger.error(`Error processing meetings for account ${accountId}:`, error);
      throw error;
    } finally {
      this.processing.delete(accountId);
    }
  }

  async processSingleMeeting(meeting) {
    try {
      // Skip if already processed recently
      if (meeting.status === 'bot_invited' || meeting.status === 'completed') {
        return meeting;
      }

      // Evaluate rules
      const applicableRules = await this.ruleEngine.evaluateMeeting(meeting, meeting.accountId);
      
      if (applicableRules.length === 0) {
        logger.debug(`No applicable rules for meeting ${meeting._id}`);
        return meeting;
      }

      // Apply the highest priority rule
      const primaryRule = applicableRules[0];
      
      if (primaryRule.actions.inviteBot && !meeting.botInvited) {
        await this.inviteBotToMeeting(meeting);
      }

      if (primaryRule.actions.notifyUser) {
        await this.notifyUser(meeting, primaryRule);
      }

      // Update meeting with applied rules
      await Meeting.findByIdAndUpdate(meeting._id, {
        appliedRules: applicableRules.map(r => r._id),
        status: meeting.botInvited ? 'bot_invited' : 'pending'
      });

      logger.info(`Processed meeting ${meeting._id} with ${applicableRules.length} rules`);
      return meeting;
      
    } catch (error) {
      logger.error(`Error processing meeting ${meeting._id}:`, error);
      await Meeting.findByIdAndUpdate(meeting._id, { status: 'failed' });
      throw error;
    }
  }

  async inviteBotToMeeting(meeting) {
    try {
      const botEmail = process.env.NOTION_BOT_EMAIL || 'meetingbot@yourdomain.com';
      
      await this.googleCalendar.inviteBotToMeeting(
        meeting.accountId,
        meeting._id,
        botEmail
      );

      logger.info(`Bot invited to meeting ${meeting._id}`);
    } catch (error) {
      logger.error(`Failed to invite bot to meeting ${meeting._id}:`, error);
      throw error;
    }
  }

  async notifyUser(meeting, rule) {
    // Implement user notification logic (email, webhook, etc.)
    logger.info(`Notifying user about meeting ${meeting._id} per rule ${rule.name}`);
  }

  async processAllActiveAccounts() {
    try {
      const accounts = await Account.find({ isActive: true });
      logger.info(`Processing ${accounts.length} active accounts`);

      const promises = accounts.map(account => 
        this.processAccountMeetings(account._id).catch(error => {
          logger.error(`Failed to process account ${account._id}:`, error);
          return null;
        })
      );

      await Promise.all(promises);
      logger.info('Completed processing all active accounts');
    } catch (error) {
      logger.error('Error processing all accounts:', error);
      throw error;
    }
  }

  async getUpcomingMeetings(accountId, hours = 24) {
    const startTime = new Date();
    const endTime = new Date(Date.now() + hours * 60 * 60 * 1000);

    return await Meeting.find({
      accountId,
      startTime: { $gte: startTime, $lte: endTime },
      status: { $in: ['pending', 'bot_invited'] }
    }).sort({ startTime: 1 });
  }
}

module.exports = MeetingProcessor;