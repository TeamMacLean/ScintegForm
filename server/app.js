import express from 'express';
import helmet from 'helmet';
import { mkdir, rm, rename, statfs, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { prepareStorage, uploadMiddleware, validateFiles, allowedTypes, HttpError } from './uploads.js';
import { requestDiagnostics } from './observability.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const sha256 = text => createHash('sha256').update(text).digest('hex');
// A notification still unsent this long after submission needs an operator to look.
function description(value) {
  // Browsers send textarea line breaks as CRLF; without this each one counts twice
  // against the limit the form's maxlength already enforced.
  const text = typeof value === 'string' ? value.replace(/\r\n?/g, '\n') : value;
  if (typeof text !== 'string' || !text.trim() || text.length > 20000 || /\x00/.test(text)) {
    throw new HttpError(400, 'Enter a description between 1 and 20,000 characters.');
  }
  return text.trim();
}
function receipt(record) { return { status: 'received', formId: String(record._id) }; }
async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function createApp({ config, db, scanner, diskStats = statfs, logger = console, onIssue = () => {} }) {
  await prepareStorage(config);
  const app = express();
  app.disable('x-powered-by');
  app.use(requestDiagnostics(config, logger));
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'none'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'"],
    connectSrc: ["'self'"], formAction: ["'self'"], baseUri: ["'none'"], frameAncestors: ["'none'"],
    upgradeInsecureRequests: config.origin.startsWith('https://') ? [] : null,
  } }, referrerPolicy: { policy: 'no-referrer' } }));
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/health/live', (req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', (req, res) => res.status(db.healthy() ? 200 : 503).json({ status: db.healthy() ? 'ready' : 'unavailable' }));
  // Status only, no counts or references: this route is reachable through the proxy.
  app.get('/health/notifications', async (req, res) => {
    let status = 'unavailable';
    try {
      if (db.healthy()) status = await db.notificationsNeedAttention(new Date(Date.now() - config.notificationOverdueMs)) ? 'attention' : 'ok';
    } catch { /* reported as unavailable */ }
    res.status(status === 'ok' ? 200 : 503).json({ status });
  });
  app.get('/api/config', (req, res) => res.json({ maxFiles: config.maxFiles, maxFileBytes: config.maxFileBytes, maxTotalBytes: config.maxTotalBytes, allowedExtensions: Object.keys(allowedTypes), testing: config.mailMode !== 'production' }));

  let requests = 0;
  let windowStart = Date.now();
  let active = 0;
  app.use('/api', (req, res, next) => {
    if (req.method !== 'POST') return next();
    if ((req.headers.origin && req.headers.origin !== config.origin) || req.headers['sec-fetch-site'] === 'cross-site') {
      return next(new HttpError(403, 'Submit this form from the Scinteg website.'));
    }
    if (Date.now() - windowStart >= 60_000) { requests = 0; windowStart = Date.now(); }
    if (++requests > config.maxRequestsPerMinute) {
      res.set('Retry-After', '60');
      return next(new HttpError(429, 'The service is busy. Please wait a minute and try again.'));
    }
    if (!db.healthy()) return next(new HttpError(503, 'Report storage is temporarily unavailable. Please try again later.'));
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key)) {
      return next(new HttpError(400, 'A valid submission key is required. Reload the form and try again.'));
    }
    req.keyHash = sha256(key.toLowerCase());
    next();
  });

  async function accept(kind, req, input, uploadDir) {
    const fingerprint = req.contentFingerprint || sha256(JSON.stringify(input));
    const matches = record => {
      if (record.fingerprint === fingerprint) return true;
      // Releases before CRLF normalization stored a different digest for the same text.
      const files = (record.files || []).map(({ storageName, ...file }) => file);
      const canonical = kind === 'help'
        ? { subject: record.subject, description: description(record.description), files }
        : { description: description(record.description), files };
      return sha256(JSON.stringify(canonical)) === fingerprint;
    };
    const existing = await db.find(kind, req.keyHash);
    if (existing) {
      if (!matches(existing)) throw new HttpError(409, 'This submission was already received with different content. Reload to start a new report.');
      return existing;
    }
    const id = db.newId();
    const target = path.join(config.dataDir, 'reports', id);
    let moved = false;
    if (uploadDir && input.files.length) {
      await syncDirectory(uploadDir);
      await rename(uploadDir, target);
      moved = true;
      await syncDirectory(path.dirname(target));
    }
    try {
      return await db.save({ _id: id, kind, keyHash: req.keyHash, fingerprint, ...input });
    } catch (error) {
      // A timed-out DB write may have succeeded. Retain files until reconciliation can
      // prove they are unreferenced; never delete evidence on an ambiguous DB failure.
      if (error.code === 11000) {
        if (moved) await rm(target, { recursive: true, force: true });
        const winner = await db.find(kind, req.keyHash);
        if (winner && matches(winner)) return winner;
        throw new HttpError(409, 'This submission key was already used with different content.');
      }
      throw error;
    }
  }

  const upload = uploadMiddleware(config);
  app.post('/api/form/new', async (req, res) => {
    if (!req.is('multipart/form-data')) throw new HttpError(415, 'Use the report form to submit files.');
    if (Number(req.headers['content-length']) > config.maxTotalBytes + 100_000) throw new HttpError(413, 'This submission exceeds the upload limit.');
    if (active >= config.maxConcurrentUploads) throw new HttpError(503, 'Uploads are busy. Please try again shortly.');
    active++;
    req.uploadDir = path.join(config.dataDir, 'quarantine', randomUUID());
    req.uploadBytes = 0;
    req.uploadAbort = new AbortController();
    const abort = () => req.uploadAbort.abort();
    req.once('aborted', abort);
    let record;
    try {
      req.diagnosticStage = 'disk_capacity';
      const disk = await diskStats(config.dataDir);
      if (disk.bavail * disk.bsize < config.minFreeBytes + config.maxTotalBytes * config.maxConcurrentUploads) {
        throw new HttpError(503, 'File storage is temporarily full. Please try again later.');
      }
      await mkdir(req.uploadDir, { mode: 0o700 });
      req.diagnosticStage = 'receiving_upload';
      await new Promise((resolve, reject) => upload(req, res, error => error ? reject(error) : resolve()));
      if (Object.keys(req.body).some(key => key !== 'description')) throw new HttpError(400, 'Unexpected form fields.');
      const text = description(req.body.description);
      req.diagnosticStage = 'validating_and_scanning';
      const files = await validateFiles(req.files || [], config, scanner);
      // Storage names vary on retry; fingerprint only the user-visible content and hashes.
      const input = { description: text, files };
      const stableFiles = files.map(({ storageName, ...file }) => file);
      const stable = sha256(JSON.stringify({ description: text, files: stableFiles }));
      // Pass the stable digest explicitly while preserving generated attachment names.
      req.contentFingerprint = stable;
      req.diagnosticStage = 'saving_report';
      record = await accept('report', req, input, req.uploadDir);
    } finally {
      req.off('aborted', abort);
      try { await rm(req.uploadDir, { recursive: true, force: true }); }
      finally { active--; }
    }
    res.status(202).json(receipt(record));
  });

  app.post('/api/help', express.json({ limit: '100kb', strict: true, inflate: false }), async (req, res) => {
    if (!req.is('application/json')) throw new HttpError(415, 'Send the help request as JSON.');
    if (!req.body || Object.keys(req.body).some(key => !['subject', 'message'].includes(key))) throw new HttpError(400, 'Unexpected help fields.');
    if (typeof req.body.subject !== 'string' || !req.body.subject.trim() || req.body.subject.length > 200 || /[\r\n\x00]/.test(req.body.subject)) throw new HttpError(400, 'Enter a subject between 1 and 200 characters on one line.');
    const record = await accept('help', req, { subject: req.body.subject.trim(), description: description(req.body.message), files: [] });
    res.status(202).json(receipt(record));
  });
  for (const [route, file] of Object.entries({ '/': 'index.html', '/help': 'help.html', '/form.js': 'form.js', '/style.css': 'style.css', '/sw.js': 'sw.js', '/favicon.ico': 'favicon.ico' })) {
    app.get(route, (req, res) => res.sendFile(path.join(publicDir, file), { lastModified: false, cacheControl: false }));
  }
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status || 500;
    let message = status < 500 ? error.message : 'The report could not be confirmed. Keep this page open and retry with the same contents.';
    if (typeof error.code === 'string' && error.code.startsWith('LIMIT_')) {
      status = ['LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_PART_COUNT'].includes(error.code) ? 413 : 400;
      message = 'The upload exceeds a file, count, or form-field limit. Check the limits shown on the form.';
    } else if (error.type === 'entity.parse.failed') { status = 400; message = 'Invalid request body.'; }
    else if (error.type === 'entity.too.large') { status = 413; message = 'The request is too large.'; }
    else if (error instanceof HttpError) message = error.message;
    else if (error.message === 'Unexpected end of form') { status = 400; message = 'The upload was incomplete. Please try again.'; }
    if (req.method === 'POST' && (status >= 500 || status === 422)) {
      try { Promise.resolve(onIssue(status === 422 ? 'SAFETY_SCAN_REJECTED' : 'SUBMISSION_FAILED', res.get('X-Request-ID'))).catch(() => logger.error('operator_alert_record_failed')); }
      catch { logger.error('operator_alert_record_failed'); }
    }
    res.status(status).json({ error: message });
  });
  return app;
}
