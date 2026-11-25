import { loadConfig } from './config.js';
import { connectDatabase } from './database.js';
import { createApp } from './app.js';
import { createMailer } from './mail.js';
import { createWorker } from './worker.js';
import { cleanupAbandoned } from './uploads.js';
import { logEvent, startRuntimeDiagnostics } from './observability.js';
import { createOperatorAlerts } from './alerts.js';
import { statfs } from 'node:fs/promises';

process.umask(0o077);
let db;
let mailer;
let stage = 'configuration';
const hints = { database: 'Check MONGODB_URI and that MongoDB is running.', storage: 'Check DATA_DIR exists and this user can write to it.' };
// An error code or class name only: database errors can contain the MongoDB URI and credentials.
function errorCode(error) {
  for (const value of [error?.codeName, error?.code, error?.name]) {
    if (typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{1,60}$/.test(value)) return value;
  }
  return 'unknown error';
}
process.on('uncaughtExceptionMonitor', () => logEvent(console, 'error', 'uncaught_exception', { pid: process.pid }));
try {
  const config = loadConfig();
  stage = 'database';
  db = await connectDatabase(config);
  stage = 'storage';
  mailer = createMailer(config);
  const alerts = await createOperatorAlerts({ config, mailer });
  const onIssue = (code, reference) => alerts.notify(code, reference);
  const app = await createApp({ config, db, onIssue });
  stage = 'startup';
  const worker = createWorker({ config, db, mailer, onIssue });
  let checking;
  const checkOperations = () => checking ||= (async () => {
    try {
      if (!db.healthy()) await alerts.notify('DATABASE_UNAVAILABLE');
      else for (const record of await db.attentionNotifications(new Date(Date.now() - config.notificationOverdueMs))) await alerts.notify('NOTIFICATIONS_NEED_ATTENTION', String(record._id));
      const disk = await statfs(config.dataDir);
      if (disk.bavail * disk.bsize < config.minFreeBytes + config.maxTotalBytes * config.maxConcurrentUploads) await alerts.notify('STORAGE_LOW');
    } catch { await alerts.notify('DATABASE_UNAVAILABLE'); }
    await alerts.flush();
  })().catch(() => console.error('operator_alert_delivery_failed')).finally(() => { checking = undefined; });
  const opsTimer = setInterval(checkOperations, 60_000); opsTimer.unref();
  const stopDiagnostics = startRuntimeDiagnostics(config, db);
  const server = app.listen(config.port, config.host, () => {
    logEvent(console, 'info', 'server_listening', { pid: process.pid, address: `${config.host}:${server.address().port}`, mailMode: config.mailMode, node: process.versions.node });
    process.send?.('ready');
    worker.start();
    checkOperations();
  });
  server.requestTimeout = 180_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5000;
  server.on('error', async error => { logEvent(console, 'error', 'server_start_failed', { code: error.code === 'EADDRINUSE' ? 'EADDRINUSE' : 'LISTEN_FAILED' }); stopDiagnostics(); await db.close(); process.exitCode = 1; });
  const cleanup = async () => {
    try { for (const id of (await cleanupAbandoned(config, db)).slice(0, 20)) await alerts.notify('STORAGE_ORPHANS_FOUND', id); }
    catch { console.error('storage_cleanup_failed'); }
  };
  await cleanup();
  const cleanupTimer = setInterval(cleanup, 3600_000);
  cleanupTimer.unref();
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    logEvent(console, 'info', 'shutdown_started', { pid: process.pid });
    stopDiagnostics();
    clearInterval(cleanupTimer);
    clearInterval(opsTimer);
    const deadline = setTimeout(() => process.exit(1), 200_000);
    deadline.unref();
    await new Promise(resolve => server.close(resolve));
    await worker.stop();
    await checking;
    await alerts.drain();
    mailer.close();
    await db.close();
    clearTimeout(deadline);
    logEvent(console, 'info', 'shutdown_complete', { pid: process.pid });
  }
  process.on('SIGTERM', () => stop().catch(() => process.exit(1)));
  process.on('SIGINT', () => stop().catch(() => process.exit(1)));
} catch (error) {
  // loadConfig's messages are written by this app and never include values, so they are safe to show.
  console.error(stage === 'configuration'
    ? `Startup failed: ${error.message}`
    : `Startup failed during ${stage} (${errorCode(error)}). ${hints[stage] || ''}`.trim());
  mailer?.close();
  await db?.close();
  process.exitCode = 1;
}
