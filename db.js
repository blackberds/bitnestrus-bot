const mysql = require('mysql2/promise');
const config = require('./config');
const logger = require('./utils/logger');

const pool = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  port: config.db.port,
  waitForConnections: true,
  connectionLimit: 12
});

pool.getConnection().then(conn => {
  conn.release();
  logger.info('DB connected');
}).catch(err => {
  logger.error('DB connection error', err);
});

module.exports = pool;
