const { google } = require('googleapis');
const IntegrationBase = require('../../base/integrationBase');
const Account = require('../../../models/Account');
const crypto = require('crypto-js');
const logger = require('../../utils/logger');

class GoogleAuthService extends IntegrationBase {
  constructor() {
    super('google-auth', {
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly'
      ]
    });
    this.oauth2Client = null;
  }

  async initialize() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    this.initialized = true;
    logger.info('Google Auth service initialized');
  }

  getAuthUrl(state = null) {
    if (!this.initialized) {
      throw new Error('Service not initialized');
    }
    
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.config.scopes,
      prompt: 'consent',
      state: state
    });
  }

  async exchangeCodeForTokens(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  async refreshToken(refreshToken) {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    return credentials;
  }

  async saveAccountTokens(email, tokens, userId) {
    const encryptedTokens = {
      accessToken: crypto.AES.encrypt(tokens.access_token, process.env.ENCRYPTION_KEY).toString(),
      refreshToken: crypto.AES.encrypt(tokens.refresh_token, process.env.ENCRYPTION_KEY).toString(),
      expiryDate: new Date(tokens.expiry_date)
    };

    const account = await Account.findOneAndUpdate(
      { email, userId },
      {
        email,
        userId,
        provider: 'google',
        tokens: encryptedTokens,
        calendarId: 'primary'
      },
      { upsert: true, new: true }
    );

    logger.info(`Saved tokens for account: ${email}`);
    return account;
  }

  async getDecryptedTokens(accountId) {
    const account = await Account.findById(accountId);
    if (!account) throw new Error('Account not found');

    return {
      access_token: crypto.AES.decrypt(account.tokens.accessToken, process.env.ENCRYPTION_KEY).toString(crypto.enc.Utf8),
      refresh_token: crypto.AES.decrypt(account.tokens.refreshToken, process.env.ENCRYPTION_KEY).toString(crypto.enc.Utf8),
      expiry_date: account.tokens.expiryDate
    };
  }
}

module.exports = GoogleAuthService;
