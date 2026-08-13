'use strict';
const noktel = require('../../config.json');
module.exports = {
  BOT_TOKEN:        noktel.bot.token,
  BOT_USERNAME:     '',
  API_ID:           noktel.telegram.apiId,
  API_HASH:         noktel.telegram.apiHash,
  OWNER_ID:         noktel.bot.adminId,
  REQUIRED_CHANNEL: null,
  SESSION_FILE:     './ubot/sessions.json',
  DOWNLOAD_PATH:    './downloads',
  DB_PATH:          './ubot/ubot_db.json',
  PREFIX:           '.',
  GREEN_API:        { idInstance: '', apiToken: '', apiUrl: '', mediaUrl: '' },
  BOT_PHOTOS:       { main: noktel.bot.startPhoto || '', ubot: '', downloader: '', info: '' },
  UBOT_PHOTOS:      { main: noktel.bot.startPhoto || '', tools: '', downloader: '', broadcast: '', afk: '', tagall: '', role: '' },
  PANEL_API:        null,
};
