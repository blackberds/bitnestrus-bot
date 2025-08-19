const fs = require('fs');
const path = require('path');
const pool = require('./db');
const logger = require('./utils/logger');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'schema.sql'), 'utf-8');
  const statements = sql.split(/;\s*$/m).map(s => s.trim()).filter(Boolean);
  const conn = await pool.getConnection();
  try {
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    logger.info('Migrations applied');
  } finally {
    conn.release();
    process.exit(0);
  }
}

migrate().catch(err => {
  logger.error('Migration failed', err);
  process.exit(1);
});
