import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TEST_EMAIL = 'deeks@nbi.ac.uk';
const address = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
function integer(env, key, fallback, min, max) {
  const value = Number(env[key] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  return value;
}
function email(value, label) {
  if (!value || !address.test(value)) throw new Error(`A valid ${label} is required`);
  return value;
}
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
export function canonicalPath(value) {
  let current = path.resolve(value);
  const missing = [];
  while (true) {
    try { return path.join(realpathSync(current), ...missing); }
    catch (error) {
      if (error.code !== 'ENOENT' || path.dirname(current) === current) throw new Error('Cannot resolve storage path');
      missing.unshift(path.basename(current)); current = path.dirname(current);
    }
  }
}

export function loadConfig(env = process.env) {
  const attachments = env.ATTACHMENTS_ENABLED ?? 'true';
  if (!['true', 'false'].includes(attachments)) throw new Error('ATTACHMENTS_ENABLED must be true or false');
  const mailMode = env.MAIL_MODE || 'capture';
  if (!['capture', 'test', 'production'].includes(mailMode)) throw new Error('Invalid MAIL_MODE');
  if (env.TEST_EMAIL && env.TEST_EMAIL !== TEST_EMAIL) throw new Error(`TEST_EMAIL must be ${TEST_EMAIL}`);
  const production = mailMode === 'production';
  const port = integer(env, 'PORT', 3000, 0, 65535);
  if (production && (!env.PUBLIC_ORIGIN || !env.MONGODB_URI)) {
    throw new Error('PUBLIC_ORIGIN and MONGODB_URI are required for production');
  }
  let origin;
  try { origin = new URL(env.PUBLIC_ORIGIN || `http://localhost:${port}`).origin; }
  catch { throw new Error('Invalid PUBLIC_ORIGIN'); }
  if (production && !origin.startsWith('https://')) throw new Error('Production PUBLIC_ORIGIN must use HTTPS');
  const scanMode = env.UPLOAD_SCAN_MODE || (mailMode === 'capture' ? 'disabled' : 'clamav');
  // George explicitly approved production uploads without antivirus scanning.
  // Production still defaults to ClamAV; disabling it requires an explicit setting.
  if (!['disabled', 'clamav'].includes(scanMode)) {
    throw new Error('Invalid UPLOAD_SCAN_MODE');
  }
  const recipients = production
    ? [...new Set((env.REPORT_RECIPIENTS || '').split(',').map(s => email(s.trim(), 'REPORT_RECIPIENTS address')))]
    : [TEST_EMAIL];
  const webmaster = production ? email(env.WEBMASTER_EMAIL || TEST_EMAIL, 'WEBMASTER_EMAIL') : TEST_EMAIL;
  const smtpHost = env.SMTP_HOST || '';
  if (mailMode !== 'capture' && !smtpHost) throw new Error('SMTP_HOST is required for delivery');
  const dataDir = canonicalPath(env.DATA_DIR || `var/${mailMode}`);
  if (inside(fileURLToPath(new URL('../public/', import.meta.url)), dataDir)) {
    throw new Error('DATA_DIR must be outside the public web directory');
  }
  // Evidence must not depend on the working directory or live inside a release folder
  // that a later deployment replaces.
  if (production && (!env.DATA_DIR || !path.isAbsolute(env.DATA_DIR) || inside(fileURLToPath(new URL('../', import.meta.url)), dataDir))) {
    throw new Error('Production requires DATA_DIR to be an absolute path outside the application directory');
  }
  const maxTotalBytes = integer(env, 'MAX_TOTAL_BYTES', 15_000_000, 1, 100_000_000);
  const maxFileBytes = integer(env, 'MAX_FILE_BYTES', Math.min(10_000_000, maxTotalBytes), 1, maxTotalBytes);
  return Object.freeze({
    mailMode, recipients, webmaster, origin, port, attachmentsEnabled: attachments === 'true',
    reportBccWebmaster: env.REPORT_BCC_WEBMASTER !== 'false',
    notificationOverdueMs: integer(env, 'NOTIFICATION_OVERDUE_MINUTES', 240, 1, 10080) * 60_000,
    alertRepeatMs: integer(env, 'ALERT_REPEAT_MINUTES', 240, 1, 10080) * 60_000,
    host: env.HOST || '127.0.0.1',
    mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scintegform_dev',
    dataDir, captureDir: path.join(dataDir, 'mail'),
    maxTotalBytes, maxFileBytes,
    maxFiles: integer(env, 'MAX_FILES', 10, 1, 25),
    maxConcurrentUploads: integer(env, 'MAX_CONCURRENT_UPLOADS', 1, 1, 16),
    maxRequestsPerMinute: integer(env, 'MAX_REQUESTS_PER_MINUTE', 30, 1, 1000),
    minFreeBytes: integer(env, 'MIN_FREE_BYTES', 500_000_000, 0, Number.MAX_SAFE_INTEGER),
    scanMode, scanCommand: env.CLAMSCAN_COMMAND || 'clamscan',
    scanDatabase: env.CLAMAV_DATABASE_DIR ? path.resolve(env.CLAMAV_DATABASE_DIR) : undefined,
    smtpHost, smtpPort: integer(env, 'SMTP_PORT', 25, 1, 65535),
    smtpSecure: env.SMTP_SECURE === 'true', smtpRequireTLS: env.SMTP_REQUIRE_TLS !== 'false',
    smtpUser: env.SMTP_USER, smtpPassword: env.SMTP_PASSWORD,
    sender: email(env.MAIL_FROM || 'scinteg@tsl.ac.uk', 'MAIL_FROM'),
    workerIntervalMs: integer(env, 'WORKER_INTERVAL_MS', 10_000, 50, 300_000),
    // 60 attempts with backoff capped at one hour keeps retrying for about two days.
    maxMailAttempts: integer(env, 'MAX_MAIL_ATTEMPTS', 60, 1, 500),
    opsLogIntervalMs: integer(env, 'OPS_LOG_INTERVAL_MS', 60000, 0, 3600000),
    slowRequestMs: integer(env, 'SLOW_REQUEST_MS', 10000, 1, 180000),
  });
}
