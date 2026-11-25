import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import request from 'supertest';
import { simpleParser } from 'mailparser';
import { temporaryMongo, officeFile } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';
import { connectDatabase } from '../server/database.js';
import { createMailer } from '../server/mail.js';
import { createWorker } from '../server/worker.js';

const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');

test('real ClamAV scans uploads using an isolated EICAR-only development database', async t => {
  const mongo = await temporaryMongo();
  const database = path.join(mongo.dir, 'test-signatures');
  await mkdir(database);
  // Known EICAR hash/length, deliberately not computed from the test input.
  // This is a fixture database, NOT general malware protection.
  await writeFile(path.join(database, 'development.hdb'), '44d88612fea8a8f36de82e1278abb02f:68:Scinteg.Development.EICAR\n');
  const config = loadConfig({ DATA_DIR: path.join(mongo.dir, 'data'), MONGODB_URI: mongo.uri, MIN_FREE_BYTES: '0', UPLOAD_SCAN_MODE: 'clamav', CLAMAV_DATABASE_DIR: database });
  const db = await connectDatabase(config);
  const mailer = createMailer(config);
  t.after(async () => { mailer.close(); await db.close(); await mongo.stop(); });
  const app = await createApp({ config, db });
  const worker = createWorker({ config, db, mailer });
  const submit = () => request(app).post('/api/form/new').set('Idempotency-Key', randomUUID()).field('description', 'Synthetic antivirus integration check');

  await t.test('clean evidence is accepted and its exact bytes reach captured email', async () => {
    const response = await submit().attach('files', Buffer.from('Clean synthetic evidence\n'), 'clean.txt');
    assert.equal(response.status, 202, JSON.stringify(response.body));
    await worker.tick();
    const message = await simpleParser(await readFile(path.join(config.captureDir, `${response.body.formId}.eml`)));
    assert.equal(message.to.text, 'deeks@nbi.ac.uk');
    assert.equal(message.attachments[0].content.toString(), 'Clean synthetic evidence\n');
  });

  await t.test('EICAR in a multi-file submission blocks the entire report and cleans quarantine', async () => {
    const before = await readdir(path.join(config.dataDir, 'reports'));
    const response = await submit().attach('files', Buffer.from('clean'), 'clean.txt').attach('files', eicar, 'eicar.txt');
    assert.equal(response.status, 422);
    assert.match(response.body.error, /safety scan/);
    assert.deepEqual(await readdir(path.join(config.dataDir, 'reports')), before);
    assert.deepEqual(await readdir(path.join(config.dataDir, 'quarantine')), []);
    assert.equal(await worker.tick(), false);
  });

  await t.test('EICAR inside an Office container is detected by the real engine', async () => {
    const response = await submit().attach('files', await officeFile({ 'word/media/test.txt': eicar }), 'evidence.docx');
    assert.equal(response.status, 422);
    assert.deepEqual(await readdir(path.join(config.dataDir, 'quarantine')), []);
    assert.equal(await worker.tick(), false);
  });

  await t.test('missing signature database rejects uploads instead of treating them as clean', async () => {
    const unavailable = await createApp({ config: { ...config, scanDatabase: path.join(mongo.dir, 'missing') }, db, logger: { error() {} } });
    const response = await request(unavailable).post('/api/form/new').set('Idempotency-Key', randomUUID()).field('description', 'Synthetic check').attach('files', Buffer.from('clean'), 'clean.txt');
    assert.equal(response.status, 503);
  });
});
