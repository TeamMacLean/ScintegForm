import { mkdir, lstat, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const codes = new Set(['SUBMISSION_FAILED', 'SAFETY_SCAN_REJECTED', 'NOTIFICATION_FAILED', 'NOTIFICATION_RETRYING', 'NOTIFICATION_STATE_UNCERTAIN', 'NOTIFICATIONS_NEED_ATTENTION', 'DATABASE_UNAVAILABLE', 'STORAGE_ORPHANS_FOUND', 'STORAGE_LOW', 'APP_UNAVAILABLE']);

// Single app process; the independent monitor uses a separate state file. Only
// bounded operational metadata is persisted, never report text or filenames.
export async function createOperatorAlerts({ config, mailer, now = Date.now, channel = 'app' }) {
  if (!['app', 'monitor'].includes(channel)) throw new Error('Invalid alert channel');
  const dir = path.join(config.dataDir, 'ops');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await lstat(dir)).isSymbolicLink()) throw new Error('Alert storage must not be a symlink');
  const file = path.join(dir, `${channel}-${config.mailMode}.json`);
  let state = { pending: {}, sent: {} };
  try { state = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read operational alert state'); }
  if (!state.pending || !state.sent || Object.keys(state.pending).some(code => !codes.has(code))) throw new Error('Invalid operational alert state');
  let queued = Promise.resolve();
  const serial = fn => { const task = queued.then(fn); queued = task.catch(() => {}); return task; };
  async function persist() {
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(state), { mode: 0o600, flush: true });
    await rename(temp, file);
  }
  return {
    notify(code, reference) {
      return serial(async () => {
        if (!codes.has(code)) throw new Error('Unknown operational issue');
        const incident = state.pending[code] ||= { code, count: 0, references: [] };
        incident.count = Math.min(1_000_000, incident.count + 1);
        if (typeof reference === 'string' && /^[a-f0-9]{24}(?:[a-f0-9]{8})?$/.test(reference) && incident.references.length < 20 && !incident.references.includes(reference)) incident.references.push(reference);
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
