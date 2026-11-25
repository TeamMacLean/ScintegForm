import { loadConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
const config = loadConfig();
const db = await connectDatabase(config);
try {
  const [action, id] = process.argv.slice(2);
  if (action === 'retry' && /^[a-f0-9]{24}$/.test(id || '')) {
    const result = await db.retry(id);
    console.info(`Queued ${result.modifiedCount} failed notification(s) for retry in ${config.mailMode} mode.`);
  } else if (!action || action === 'list') {
    for (const record of await db.listNotifications()) {
      console.info(JSON.stringify({ id: String(record._id), kind: record.kind, createdAt: record.createdAt, state: record.notification.state, attempts: record.notification.attempts, lastError: record.notification.lastError }));
    }
  } else throw new Error('Usage: npm run notifications -- [list | retry <reference>]');
} finally { await db.close(); }
