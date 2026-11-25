import { loadConfig } from './config.js';
import { connectDatabase } from './database.js';
import { createApp } from './app.js';
import { createMailer } from './mail.js';
import { createWorker } from './worker.js';
import { cleanupAbandoned } from './uploads.js';
import { logEvent, startRuntimeDiagnostics } from './observability.js';

process.umask(0o077);
let db;
let mailer;
process.on('uncaughtExceptionMonitor', () => logEvent(console, 'error', 'uncaught_exception', { pid: process.pid }));
try {
  const config = loadConfig();
  db = await connectDatabase(config);
  const app = await createApp({ config, db });
  mailer = createMailer(config);
  const worker = createWorker({ config, db, mailer });
  const stopDiagnostics = startRuntimeDiagnostics(config, db);
  const server = app.listen(config.port, config.host, () => {
    logEvent(console, 'info', 'server_listening', { pid: process.pid, address: `${config.host}:${server.address().port}`, mailMode: config.mailMode, node: process.versions.node });
    process.send?.('ready');
    worker.start();
  });
  server.requestTimeout = 180_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5000;
  server.on('error', async error => { logEvent(console, 'error', 'server_start_failed', { code: error.code === 'EADDRINUSE' ? 'EADDRINUSE' : 'LISTEN_FAILED' }); stopDiagnostics(); await db.close(); process.exitCode = 1; });
  const cleanup = () => cleanupAbandoned(config, db).catch(() => console.error('storage_cleanup_failed'));
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
    const deadline = setTimeout(() => process.exit(1), 200_000);
    deadline.unref();
    await new Promise(resolve => server.close(resolve));
    await worker.stop();
    mailer.close();
    await db.close();
    clearTimeout(deadline);
    logEvent(console, 'info', 'shutdown_complete', { pid: process.pid });
  }
  process.on('SIGTERM', () => stop().catch(() => process.exit(1)));
  process.on('SIGINT', () => stop().catch(() => process.exit(1)));
} catch (error) {
  // Configuration errors are safe to show; database errors can contain credentials.
  console.error(db ? 'startup_failed' : 'Startup failed. Check configuration and MongoDB availability.');
  mailer?.close();
  await db?.close();
  process.exitCode = 1;
}
