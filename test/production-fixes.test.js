import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { brotliCompressSync } from 'node:zlib';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

test('production rejects compressed JSON and returns safe JSON for numeric database errors', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-boundary-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const db = { healthy: () => true, find: async () => null, newId: () => '0123456789abcdef01234567', save: async () => { throw Object.assign(new Error('private database text'), { code: 64 }); } };
  const issues = [];
  const app = await createApp({ config: loadConfig({ DATA_DIR: dir, MIN_FREE_BYTES: '0' }), db, logger: { error() {} }, onIssue: (code, reference) => issues.push({ code, reference }) });
  app.set('env', 'production');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const compressed = await fetch(`http://127.0.0.1:${server.address().port}/api/help`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'br', 'Idempotency-Key': randomUUID() }, body: brotliCompressSync(Buffer.from(JSON.stringify({ subject: 'Synthetic', message: 'Synthetic' }))) });
  assert.equal(compressed.status, 415);
  const response = await request(app).post('/api/form/new').set('Idempotency-Key', randomUUID()).field('description', 'Synthetic');
  assert.equal(response.status, 500);
  assert.match(response.headers['content-type'], /application\/json/);
  assert.doesNotMatch(response.text, /private database text|TypeError/);
  assert.deepEqual(issues, [{ code: 'SUBMISSION_FAILED', reference: response.headers['x-request-id'] }]);
});

test('production DATA_DIR cannot hide inside a release through a symlink', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-path-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const alias = path.join(dir, 'release'); await symlink(process.cwd(), alias);
  assert.throws(() => loadConfig({ MAIL_MODE: 'production', MONGODB_URI: 'mongodb://127.0.0.1/review', PUBLIC_ORIGIN: 'https://review.invalid', SMTP_HOST: 'smtp.invalid', REPORT_RECIPIENTS: 'investigator@example.invalid', WEBMASTER_EMAIL: 'deeks@nbi.ac.uk', DATA_DIR: path.join(alias, 'var/evidence') }), /DATA_DIR/);
});
