require('dotenv').config();
const { startBot } = require('./bot/bot');
const { startServer } = require('./server/server');
const { startNotifications } = require('./services/notifications');
const logger = require('./utils/logger');

(async () => {
  try {
    await startBot();
    await startServer();
    startNotifications();
    logger.info('All services started');
  } catch (err) {
    logger.error('Failed to start services', err);
    process.exit(1);
  }
})();
