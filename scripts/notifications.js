import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
import { createMailer } from '../server/mail.js';
let db;
try {
  const config = loadConfig();
  const [action = 'list', id] = process.argv.slice(2);
  if (!['list', 'retry', 'export', 'resolve'].includes(action) || (action !== 'list' && !/^[a-f0-9]{24}$/.test(id || ''))) throw new Error('Invalid command');
  db = await connectDatabase(config);
  console.info(`Notification maintenance: ${config.mailMode} mode.`);
  if (action === 'retry') console.info(`Queued ${(await db.retry(id)).modifiedCount} failed notification(s). Check for prior/partial delivery before retrying.`);
  else if (action === 'resolve') console.info(`Marked ${(await db.resolve(id)).modifiedCount} failed notification(s) as manually resolved. Use only after confirming delivery/recovery.`);
  else if (action === 'export') {
    const record = await db.getNotification(id);
    if (!record) throw new Error('Missing notification');
    const captureDir = path.join(config.dataDir, 'recovery', `${id}-${Date.now()}`);
    const capture = createMailer({ ...config, mailMode: 'capture', captureDir });
    try { await capture.send(record); } finally { capture.close(); }
    console.info(`Private recovery email: ${path.join(captureDir, `${id}.eml`)}. Contains sensitive evidence; no email sent. Open and forward manually only to the verified recipients.`);
  } else {
    for (const record of await db.listNotifications()) console.info(JSON.stringify({ id: String(record._id), kind: record.kind, createdAt: record.createdAt, state: record.notification.state, attempts: record.notification.attempts, lastError: record.notification.lastError }));
  }
} catch {
  console.error('Notification maintenance failed. Check command, selected mode, database and private storage. Usage: notifications [list | retry <reference> | export <reference> | resolve <reference>].');
  process.exitCode = 1;
} finally { await db?.close(); }
