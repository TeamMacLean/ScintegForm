import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mail.js';
import { createOperatorAlerts, runOperationalChecks } from '../server/alerts.js';

test('operator alerts survive relay failure and restart, coalesce incidents, and throttle reminders', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-alerts-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = loadConfig({ DATA_DIR: dir });
  let clock = Date.now();
  const failed = await createOperatorAlerts({ config, now: () => clock, mailer: { sendAlert: async () => { throw new Error('private relay error'); } } });
  await failed.notify('NOTIFICATION_FAILED', '0123456789abcdef01234567');
  await assert.rejects(failed.flush());
  const mailer = createMailer(config);
  t.after(() => mailer.close());
  const recovered = await createOperatorAlerts({ config, now: () => clock, mailer });
  assert.equal(await recovered.flush(), true);
  const [file] = await readdir(config.captureDir);
  const raw = await readFile(path.join(config.captureDir, file), 'utf8');
  assert.match(raw, /deeks@nbi.ac.uk/); assert.match(raw, /NOTIFICATION_FAILED/); assert.doesNotMatch(raw, /private relay error/);
  await recovered.notify('NOTIFICATION_FAILED', '0123456789abcdef01234567');
  assert.equal(await recovered.flush(), false);
  clock += 4 * 3600_000;
  assert.equal(await recovered.flush(), true);
  assert.equal((await readdir(config.captureDir)).length, 2);
  await assert.rejects(recovered.notify('private arbitrary text'), /Unknown operational issue/);
});

test('a damaged or foreign alert state file is set aside or filtered instead of stopping startup', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-alerts-state-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = loadConfig({ DATA_DIR: dir });
  const file = path.join(dir, 'ops', `app-${config.mailMode}.json`);
  const sent = [];
  const mailer = { sendAlert: async alert => { sent.push(alert); } };
  const warnings = [];
  const logger = { warn: line => warnings.push(JSON.parse(line)) };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '{"pending": {"NOTIFICATION_FAI');
  const reset = await createOperatorAlerts({ config, mailer, logger, now: () => 1234 });
  assert.equal(await reset.flush(), false);
  assert.deepEqual(warnings.map(event => event.event), ['operator_alert_state_reset']);
  assert.equal(await readFile(`${file}.invalid-1234`, 'utf8'), '{"pending": {"NOTIFICATION_FAI', 'damaged file kept for inspection');
  // A file from another release: unknown codes and malformed entries are dropped, known ones kept.
  await writeFile(file, JSON.stringify({ pending: {
    FUTURE_CODE: { code: 'FUTURE_CODE', count: 1, references: [] },
    STORAGE_LOW: { code: 'STORAGE_LOW', count: 'many', references: [] },
    NOTIFICATION_FAILED: { code: 'NOTIFICATION_FAILED', count: 2, references: ['0123456789abcdef01234567', 'not a reference'] },
  }, sent: { FUTURE_CODE: 1 } }));
  const filtered = await createOperatorAlerts({ config, mailer, logger });
  assert.equal(await filtered.flush(), true);
  assert.deepEqual(sent[0].issues, [{ code: 'NOTIFICATION_FAILED', count: 2, references: ['0123456789abcdef01234567'] }]);
  assert.equal(warnings.length, 1);
});

test('the minute check reports each failure under its own category', async () => {
  const config = loadConfig({ MIN_FREE_BYTES: '0' });
  const recorded = [];
  const alerts = { notify: async (code, id) => { recorded.push(id ? `${code}:${id}` : code); }, flush: async () => { recorded.push('flush'); } };
  const healthy = { healthy: () => true, attentionNotifications: async () => [{ _id: '0123456789abcdef01234567' }] };
  const roomy = async () => ({ bavail: 1e9, bsize: 4096 });
  const failing = async () => { throw Object.assign(new Error('EIO'), { code: 'EIO' }); };
  await runOperationalChecks({ config, db: healthy, alerts, diskStats: failing });
  assert.deepEqual(recorded.splice(0), ['NOTIFICATIONS_NEED_ATTENTION:0123456789abcdef01234567', 'STORAGE_UNAVAILABLE', 'flush'], 'a disk error is not reported as a database failure');
  await runOperationalChecks({ config, db: { healthy: () => true, attentionNotifications: async () => { throw new Error('query failed'); } }, alerts, diskStats: roomy });
  assert.deepEqual(recorded.splice(0), ['DATABASE_UNAVAILABLE', 'flush']);
  await runOperationalChecks({ config, db: { healthy: () => false }, alerts, diskStats: async () => ({ bavail: 0, bsize: 4096 }) });
  assert.deepEqual(recorded.splice(0), ['DATABASE_UNAVAILABLE', 'STORAGE_LOW', 'flush']);
  await runOperationalChecks({ config, db: healthy, alerts: { ...alerts, notify: async () => { throw new Error('cannot persist'); } }, diskStats: roomy }).then(
    () => assert.fail('a failure to record an alert must reach the caller'), () => {});
});
