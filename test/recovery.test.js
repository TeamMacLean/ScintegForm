import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import request from 'supertest';
import { simpleParser } from 'mailparser';
import { temporaryMongo } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';

test('old CRLF fingerprints remain idempotent for reports with files and help; private recovery exports original evidence', async t => {
  const mongo = await temporaryMongo();
  const config = loadConfig({ DATA_DIR: path.join(mongo.dir, 'data'), MONGODB_URI: mongo.uri, MIN_FREE_BYTES: '0' });
  const db = await connectDatabase(config);
  t.after(async () => { await db.close(); await mongo.stop(); });
  // Reproduce d6108c9 storage without migrating the accepted record.
  const legacy = { ...db, save: input => {
    const description = input.description.replace(/\n/g, '\r\n');
    const files = input.files.map(({ storageName, ...file }) => file);
    const stable = input.kind === 'help' ? { subject: input.subject, description, files } : { description, files };
    return db.save({ ...input, description, fingerprint: createHash('sha256').update(JSON.stringify(stable)).digest('hex') });
  } };
  const app = await createApp({ config, db: legacy });
  const key = randomUUID();
  const report = text => request(app).post('/api/form/new').set('Idempotency-Key', key).field('description', text).attach('files', Buffer.from('Synthetic original bytes'), 'evidence.txt');
  const first = await report('First line\r\nSecond line');
  assert.equal(first.status, 202);
  const retry = await report('First line\nSecond line');
  assert.equal(retry.status, 202); assert.equal(retry.body.formId, first.body.formId);
  assert.equal((await report('Changed\ncontent')).status, 409);
  const helpKey = randomUUID();
  const help = text => request(app).post('/api/help').set('Idempotency-Key', helpKey).send({ subject: 'Synthetic help', message: text });
  const helpFirst = await help('First\r\nSecond');
  const helpRetry = await help('First\nSecond');
  assert.equal(helpFirst.status, 202); assert.equal(helpRetry.status, 202); assert.equal(helpFirst.body.formId, helpRetry.body.formId);

  const claim = await db.claim(new Date(Date.now() + 1000));
  await db.finish(claim, { state: 'failed', lastError: 'DELIVERY_UNCERTAIN' });
  const envFile = path.join(mongo.dir, 'synthetic.env');
  await writeFile(envFile, `MAIL_MODE=capture\nDATA_DIR=${config.dataDir}\nMONGODB_URI=${mongo.uri}\n`);
  const run = action => promisify(execFile)(process.execPath, ['scripts/run.js', 'notifications', '--env-file', envFile, action, first.body.formId], { env: { PATH: process.env.PATH } });
  const output = await run('export');
  assert.doesNotMatch(output.stdout + output.stderr, /Synthetic original bytes|First line/);
  const [directory] = await readdir(path.join(config.dataDir, 'recovery'));
  const message = await simpleParser(await readFile(path.join(config.dataDir, 'recovery', directory, `${first.body.formId}.eml`)));
  assert.equal(message.attachments[0].content.toString(), 'Synthetic original bytes');
  assert.equal(message.to.text, 'deeks@nbi.ac.uk');
  assert.equal((await db.getNotification(first.body.formId)).notification.state, 'failed', 'export does not mark delivery complete');
  await run('resolve');
  assert.equal((await db.getNotification(first.body.formId)).notification.lastError, 'MANUALLY_RESOLVED');
});
