import { mkdir, lstat, readFile, writeFile, rename, statfs } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { logEvent } from './observability.js';

const codes = new Set(['SUBMISSION_FAILED', 'SAFETY_SCAN_REJECTED', 'NOTIFICATION_FAILED', 'NOTIFICATION_RETRYING', 'NOTIFICATION_STATE_UNCERTAIN', 'NOTIFICATIONS_NEED_ATTENTION', 'DATABASE_UNAVAILABLE', 'STORAGE_ORPHANS_FOUND', 'STORAGE_LOW', 'STORAGE_UNAVAILABLE', 'APP_UNAVAILABLE']);
const reference = /^[a-f0-9]{24}(?:[a-f0-9]{8})?$/;

// Keeps only entries this version understands, so a damaged file or one written by
// another release cannot stop the app starting. Returns null for unusable JSON.
function validState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const state = { pending: {}, sent: {} };
  for (const [code, issue] of Object.entries(raw.pending ?? {})) {
    if (codes.has(code) && Number.isSafeInteger(issue?.count) && Array.isArray(issue.references)) {
      state.pending[code] = { code, count: Math.min(1_000_000, Math.max(1, issue.count)), references: issue.references.filter(id => typeof id === 'string' && reference.test(id)).slice(0, 20) };
    }
  }
  for (const [code, at] of Object.entries(raw.sent ?? {})) if (codes.has(code) && Number.isFinite(at)) state.sent[code] = at;
  return state;
}

// Single app process; the independent monitor uses a separate state file. Only
// bounded operational metadata is persisted, never report text or filenames.
export async function createOperatorAlerts({ config, mailer, now = Date.now, channel = 'app', logger = console }) {
  if (!['app', 'monitor'].includes(channel)) throw new Error('Invalid alert channel');
  const dir = path.join(config.dataDir, 'ops');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await lstat(dir)).isSymbolicLink()) throw new Error('Alert storage must not be a symlink');
  const file = path.join(dir, `${channel}-${config.mailMode}.json`);
  let state = { pending: {}, sent: {} };
  let text;
  try { text = await readFile(file, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read operational alert state'); }
  if (text !== undefined) {
    let parsed;
    try { parsed = validState(JSON.parse(text)); } catch { parsed = null; }
    if (parsed) state = parsed;
    else {
      // Set the unreadable file aside for inspection and start with empty state.
      await rename(file, `${file}.invalid-${now()}`);
      logEvent(logger, 'warn', 'operator_alert_state_reset', { channel });
    }
  }
  let queued = Promise.resolve();
  const serial = fn => { const task = queued.then(fn); queued = task.catch(() => {}); return task; };
  async function persist() {
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(state), { mode: 0o600, flush: true });
    await rename(temp, file);
  }
  return {
    notify(code, id) {
      return serial(async () => {
        if (!codes.has(code)) throw new Error('Unknown operational issue');
        const incident = state.pending[code] ||= { code, count: 0, references: [] };
        incident.count = Math.min(1_000_000, incident.count + 1);
        if (typeof id === 'string' && reference.test(id) && incident.references.length < 20 && !incident.references.includes(id)) incident.references.push(id);
        await persist();
      });
    },
    flush() {
      return serial(async () => {
        const issues = Object.values(state.pending).filter(issue => now() - (state.sent[issue.code] ?? -Infinity) >= config.alertRepeatMs);
        if (!issues.length) return false;
        await mailer.sendAlert({ id: randomUUID(), issues });
        for (const issue of issues) { state.sent[issue.code] = now(); delete state.pending[issue.code]; }
        await persist();
        return true;
      });
    },
    drain: () => queued,
  };
}

// The app's minute check. Each probe is caught separately so a failure is reported
// under its own category; failing to record or send an alert rejects for the caller.
export async function runOperationalChecks({ config, db, alerts, diskStats = statfs }) {
  let database = db.healthy() ? 'ok' : 'unavailable';
  let attention = [];
  if (database === 'ok') {
    try { attention = await db.attentionNotifications(new Date(Date.now() - config.notificationOverdueMs)); }
    catch { database = 'unavailable'; }
  }
  let storage;
  try {
    const disk = await diskStats(config.dataDir);
    storage = disk.bavail * disk.bsize < config.minFreeBytes + config.maxTotalBytes * config.maxConcurrentUploads ? 'low' : 'ok';
  } catch { storage = 'unavailable'; }
  if (database === 'unavailable') await alerts.notify('DATABASE_UNAVAILABLE');
  for (const record of attention) await alerts.notify('NOTIFICATIONS_NEED_ATTENTION', String(record._id));
  if (storage === 'low') await alerts.notify('STORAGE_LOW');
  if (storage === 'unavailable') await alerts.notify('STORAGE_UNAVAILABLE');
  await alerts.flush();
}
