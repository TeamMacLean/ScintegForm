import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { temporaryMongo } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { createWorker } from '../server/worker.js';

test('attachment flag defaults on, is strict, and never relaxes production scanning', () => {
  assert.equal(loadConfig({}).attachmentsEnabled, true);
  assert.equal(loadConfig({ ATTACHMENTS_ENABLED: 'false' }).attachmentsEnabled, false);
  for (const value of ['', '0', 'FALSE', 'typo']) assert.throws(() => loadConfig({ ATTACHMENTS_ENABLED: value }), /ATTACHMENTS_ENABLED/);
  assert.throws(() => loadConfig({ MAX_FILES: '0' }), /MAX_FILES/);
  for (const flag of ['true', 'false']) assert.throws(() => loadConfig({ ATTACHMENTS_ENABLED: flag, MAIL_MODE: 'production', MONGODB_URI: 'mongodb://localhost/synthetic', PUBLIC_ORIGIN: 'https://synthetic.invalid', UPLOAD_SCAN_MODE: 'disabled' }), /clamav/);
});

test('production text-only reports stay durable, reject all uploads and never start the scanner', async t => {
  const mongo = await temporaryMongo();
  let db;
  t.after(async () => { await db?.close(); await mongo.stop(); });
  const marker = path.join(mongo.dir, 'scanner-started');
  const command = path.join(mongo.dir, 'scanner');
  await writeFile(command, `#!/bin/sh\nprintf invoked > '${marker}'\nexit 1\n`, { mode: 0o700 });
  const config = loadConfig({ ATTACHMENTS_ENABLED: 'false', MAIL_MODE: 'production', PUBLIC_ORIGIN: 'https://synthetic.invalid', MONGODB_URI: mongo.uri, DATA_DIR: path.join(mongo.dir, 'data'), REPORT_RECIPIENTS: 'nick.talbot@tsl.ac.uk,debbie.feather@tsl.ac.uk', WEBMASTER_EMAIL: 'deeks@nbi.ac.uk', SMTP_HOST: 'synthetic.invalid', UPLOAD_SCAN_MODE: 'clamav', CLAMSCAN_COMMAND: command, MIN_FREE_BYTES: '0', MAX_REQUESTS_PER_MINUTE: '1000' });
  db = await connectDatabase(config);
  const app = await createApp({ config, db, logger: { error() {}, info() {} } });
  const delivered = [];
  const worker = createWorker({ config, db, mailer: { send: async record => { delivered.push(record); } } });
  const post = (target = app, key = randomUUID()) => request(target).post('/api/form/new').set('Idempotency-Key', key);
  const publicConfig = await request(app).get('/api/config');
  assert.equal(publicConfig.body.attachmentsEnabled, false);
  assert.equal(publicConfig.body.testing, false);

  await t.test('description-only reports are persisted, deduplicated and delivered through the durable queue', async () => {
    const key = randomUUID();
    const response = await post(app, key).send({ description: 'Synthetic text-only report' });
    assert.equal(response.status, 202);
    const record = await db.getNotification(response.body.formId);
    assert.equal(record.description, 'Synthetic text-only report');
    assert.deepEqual(record.files, []);
    assert.equal(record.mode, 'production');
    assert.equal(record.notification.state, 'pending');
    assert.equal((await post(app, key).send({ description: 'Synthetic text-only report' })).body.formId, response.body.formId);
    assert.equal(await worker.tick(), true);
    assert.equal((await db.getNotification(response.body.formId)).notification.state, 'sent');
    assert.equal(delivered[0].description, record.description);
  });

  await t.test('help remains available and uses the same durable queue', async () => {
    const response = await request(app).post('/api/help').set('Idempotency-Key', randomUUID()).send({ subject: 'Synthetic help', message: 'Synthetic text-only assistance' });
    assert.equal(response.status, 202);
    await worker.tick();
    assert.equal(delivered[1].kind, 'help');
    assert.equal((await db.getNotification(response.body.formId)).notification.state, 'sent');
  });

  await t.test('multipart uploads, empty filenames and disguised JSON file fields fail without accepting a report', async () => {
    for (const bytes of [Buffer.from('synthetic evidence'), Buffer.alloc(0)]) {
      const response = await post().field('description', 'Must not be accepted').attach('files', bytes, 'evidence.txt');
      assert.equal(response.status, 415);
      assert.match(response.body.error, /Attachments are temporarily unavailable/);
    }
    const emptyName = await post().set('Content-Type', 'multipart/form-data; boundary=test').send('--test\r\nContent-Disposition: form-data; name="description"\r\n\r\nSynthetic\r\n--test\r\nContent-Disposition: form-data; name="files"; filename=""\r\nContent-Type: application/octet-stream\r\n\r\nnot discarded\r\n--test--\r\n');
    assert.equal(emptyName.status, 415);
    assert.equal((await post().send({ description: 'Synthetic', files: ['not accepted'] })).status, 400);
    assert.equal((await post().send({ description: ' ' })).status, 400);
    assert.equal((await post().send({ description: 'x'.repeat(110000) })).status, 413);
    assert.deepEqual(await readdir(path.join(config.dataDir, 'quarantine')), []);
    assert.deepEqual(await readdir(path.join(config.dataDir, 'reports')), []);
    assert.deepEqual(await db.listNotifications(), []);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  });

  await t.test('re-enabling attachments restores required scanner execution and fails closed', async () => {
    const enabled = await createApp({ config: { ...config, attachmentsEnabled: true }, db, logger: { error() {}, info() {} } });
    const response = await post(enabled).field('description', 'Synthetic scanner check').attach('files', Buffer.from('synthetic evidence'), 'evidence.txt');
    assert.equal(response.status, 422);
    assert.equal(await readFile(marker, 'utf8'), 'invoked');
  });
});
