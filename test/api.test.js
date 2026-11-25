import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile, utimes } from 'node:fs/promises';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import request from 'supertest';
import { simpleParser } from 'mailparser';
import { temporaryMongo, officeFile } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { createMailer } from '../server/mail.js';
import { createWorker } from '../server/worker.js';
import { HttpError, cleanupAbandoned } from '../server/uploads.js';

test('report acceptance, delivery and retries use isolated storage and real MongoDB', async t => {
  const mongo = await temporaryMongo();
  const config = loadConfig({ DATA_DIR: path.join(mongo.dir, 'data'), MONGODB_URI: mongo.uri, MIN_FREE_BYTES: '0', MAX_REQUESTS_PER_MINUTE: '1000' });
  const db = await connectDatabase(config);
  const mailer = createMailer(config);
  const app = await createApp({ config, db });
  const worker = createWorker({ config, db, mailer });
  t.after(async () => { mailer.close(); await db.close(); await mongo.stop(); });

  await t.test('text and attachment survive storage and are delivered intact', async () => {
    const key = randomUUID();
    const submit = () => request(app).post('/api/form/new').set('Idempotency-Key', key)
      .field('description', 'Synthetic misconduct report')
      .attach('files', Buffer.from('Original evidence\n'), 'evidence.txt');
    const response = await submit();
    assert.equal(response.status, 202);
    assert.equal(response.body.status, 'received');
    assert.match(response.body.formId, /^[a-f0-9]{24}$/);
    const repeated = await submit();
    assert.equal(repeated.body.formId, response.body.formId);
    await worker.tick();
    const captured = await readdir(config.captureDir);
    assert.equal(captured.length, 1);
    const mail = await simpleParser(await readFile(path.join(config.captureDir, captured[0])));
    assert.match(mail.text, /Synthetic misconduct report/);
    assert.equal(mail.attachments[0].content.toString(), 'Original evidence\n');
    assert.equal(mail.attachments[0].filename, 'evidence.txt');
    assert.equal(mail.to.text, 'deeks@nbi.ac.uk');
    assert.deepEqual(await readdir(path.join(config.dataDir, 'quarantine')), []);
  });

  const post = (target = app, key = randomUUID()) => request(target).post('/api/form/new').set('Idempotency-Key', key);
  const clean = async () => assert.deepEqual(await readdir(path.join(config.dataDir, 'quarantine')), []);

  await t.test('description-only report works and concurrent identical submissions are deduplicated', async () => {
    const key = randomUUID();
    const [first, second] = await Promise.all([post(app, key).field('description', 'Concurrent report'), post(app, key).field('description', 'Concurrent report')]);
    assert.equal(first.status, 202); assert.equal(second.status, 202);
    assert.equal(first.body.formId, second.body.formId);
    const conflict = await post(app, key).field('description', 'Different content');
    assert.equal(conflict.status, 409);
    await worker.tick(); await clean();
  });

  for (const [name, build] of [
    ['empty description', req => req.field('description', '   ')],
    ['missing description', req => req.attach('files', Buffer.from('evidence'), 'a.txt')],
    ['overlong description', req => req.field('description', 'x'.repeat(20001))],
    ['duplicate description', req => req.field('description', 'one').field('description', 'two')],
    ['unexpected field', req => req.field('unexpected', 'value')],
    ['empty attachment', req => req.field('description', 'report').attach('files', Buffer.alloc(0), 'empty.txt')],
  ]) {
    await t.test(`rejects ${name} and cleans temporary files`, async () => {
      const response = await build(post()); assert.equal(response.status, 400); await clean();
    });
  }

  for (const [name, filename, bytes] of [
    ['executable', 'malware.exe', Buffer.from('MZ executable')],
    ['archive', 'bundle.zip', Buffer.from('PK\x03\x04')],
    ['disguised PDF', 'evidence.pdf', Buffer.from('not a PDF')],
    ['binary text', 'evidence.txt', Buffer.from([0, 1, 2, 255])],
    ['macro-enabled document', 'evidence.docm', Buffer.from('PK\x03\x04')],
  ]) {
    await t.test(`rejects ${name} regardless of client MIME`, async () => {
      const response = await post().field('description', 'report').attach('files', bytes, { filename, contentType: 'application/pdf' });
      assert.equal(response.status, 415); await clean();
    });
  }

  await t.test('enforces individual, combined and file-count limits', async () => {
    const limited = await createApp({ config: { ...config, maxFileBytes: 8, maxTotalBytes: 10, maxFiles: 2 }, db });
    const individual = await post(limited).field('description', 'report').attach('files', Buffer.from('123456789'), 'a.txt');
    assert.equal(individual.status, 413);
    const combined = await post(limited).field('description', 'report').attach('files', Buffer.from('123456'), 'a.txt').attach('files', Buffer.from('abcdef'), 'b.txt');
    assert.equal(combined.status, 413);
    const count = await post(limited).field('description', 'report').attach('files', Buffer.from('a'), 'a.txt').attach('files', Buffer.from('b'), 'b.txt').attach('files', Buffer.from('c'), 'c.txt');
    assert.equal(count.status, 413); await clean();
  });

  await t.test('rejects unsafe filenames without HTML or filesystem access', async () => {
    const response = await post().field('description', 'report').attach('files', Buffer.from('evidence'), '<img>.txt');
    assert.equal(response.status, 400); await clean();
    assert.equal((await request(app).get('/uploads/anything')).status, 404);
    assert.equal((await request(app).get('/.env')).status, 404);
    assert.equal((await request(app).get('/api/submissions/anything')).status, 404);
  });

  await t.test('blocks cross-origin and invalid-key submissions before receiving files', async () => {
    assert.equal((await post().set('Origin', 'https://evil.invalid').field('description', 'report')).status, 403);
    assert.equal((await request(app).post('/api/form/new').field('description', 'report')).status, 400);
    assert.equal((await post(app, 'not-a-uuid').field('description', 'report')).status, 400);
    assert.equal((await post().send({ description: 'report' })).status, 415);
    await clean();
  });

  await t.test('malformed multipart returns a controlled error and cleans up', async () => {
    const response = await post().set('Content-Type', 'multipart/form-data; boundary=test').send('--test\r\nContent-Disposition: form-data; name="files"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\npartial');
    assert.equal(response.status, 400); await clean();
  });

  await t.test('disconnected uploads are removed', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/form/new', method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=abort', 'Idempotency-Key': randomUUID() } });
      req.on('error', () => {});
      req.write('--abort\r\nContent-Disposition: form-data; name="files"; filename="partial.txt"\r\nContent-Type: text/plain\r\n\r\npartial evidence');
      await delay(50); req.destroy();
      for (let n = 0; n < 40; n++) { if (!(await readdir(path.join(config.dataDir, 'quarantine'))).length) break; await delay(25); }
      await clean();
    } finally { await new Promise(resolve => server.close(resolve)); }
  });

  await t.test('scan failure and unavailable scanner fail closed', async () => {
    for (const status of [422, 503]) {
      const guarded = await createApp({ config, db, scanner: async () => { throw new HttpError(status, 'Safety scan failed'); }, logger: { error() {} } });
      const response = await post(guarded).field('description', 'report').attach('files', Buffer.from('evidence'), 'a.txt');
      assert.equal(response.status, status); await clean();
    }
  });

  await t.test('low disk space and database outage return retriable errors', async () => {
    const full = await createApp({ config, db, diskStats: async () => ({ bavail: 0, bsize: 4096 }), logger: { error() {} } });
    assert.equal((await post(full).field('description', 'report')).status, 503);
    const offline = await createApp({ config, db: { ...db, healthy: () => false }, logger: { error() {} } });
    assert.equal((await post(offline).field('description', 'report')).status, 503);
    assert.equal((await request(offline).get('/health/ready')).status, 503); await clean();
  });

  await t.test('rate limit uses no persistent client identifiers', async () => {
    const limited = await createApp({ config: { ...config, maxRequestsPerMinute: 1 }, db });
    await post(limited).field('description', ' ');
    const response = await post(limited).field('description', ' ');
    assert.equal(response.status, 429); assert.equal(response.headers['retry-after'], '60');
  });

  await t.test('security headers disable caches, framing and third-party scripts', async () => {
    const response = await request(app).get('/');
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  });

  await t.test('help requests are validated, durable and routed to the test inbox', async () => {
    const key = randomUUID();
    const send = body => request(app).post('/api/help').set('Idempotency-Key', key).send(body);
    assert.equal((await send({ subject: 'test', message: ' ' })).status, 400);
    assert.equal((await send({ subject: 'bad\r\nsubject', message: 'test' })).status, 400);
    const response = await send({ subject: 'Help', message: 'Synthetic help query' });
    assert.equal(response.status, 202);
    assert.equal((await send({ subject: 'Help', message: 'Synthetic help query' })).body.formId, response.body.formId);
    await worker.tick();
    const message = await simpleParser(await readFile(path.join(config.captureDir, `${response.body.formId}.eml`)));
    assert.equal(message.to.text, 'deeks@nbi.ac.uk'); assert.match(message.text, /Synthetic help query/);
  });

  await t.test('SMTP failure keeps the report and retries after restart without a new submission', async () => {
    const response = await post().field('description', 'Report during SMTP outage');
    let clock = new Date(Date.now() + 1000);
    const failing = createWorker({ config, db, now: () => clock, mailer: { async send() { throw new Error('private SMTP details'); } }, logger: { error() {} } });
    await failing.tick();
    let pending = (await db.listNotifications()).find(item => String(item._id) === response.body.formId);
    assert.equal(pending.notification.state, 'pending'); assert.equal(pending.notification.attempts, 1);
    assert.equal(await failing.tick(), false);
    clock = new Date(clock.getTime() + 31_000);
    const restarted = createWorker({ config, db, mailer, now: () => clock });
    assert.equal(await restarted.tick(), true);
    assert.ok(!(await db.listNotifications()).some(item => String(item._id) === response.body.formId));
    assert.ok((await readdir(config.captureDir)).includes(`${response.body.formId}.eml`));
  });

  await t.test('failed DB writes retain uncertain evidence until safe orphan reconciliation', async () => {
    const unavailable = await createApp({ config, db: { ...db, save: async () => { throw new Error('write outcome unknown'); } }, logger: { error() {} } });
    const before = new Set(await readdir(path.join(config.dataDir, 'reports')));
    const response = await post(unavailable).field('description', 'report').attach('files', Buffer.from('evidence'), 'a.txt');
    assert.equal(response.status, 500); await clean();
    const dirs = await readdir(path.join(config.dataDir, 'reports'));
    const orphan = dirs.find(dir => !before.has(dir));
    assert.ok(orphan);
    await cleanupAbandoned(config, db);
    assert.ok((await readdir(path.join(config.dataDir, 'reports'))).includes(orphan));
    const old = new Date(Date.now() - 2 * 86400_000);
    await utimes(path.join(config.dataDir, 'reports', orphan), old, old);
    await cleanupAbandoned(config, db);
    const remaining = await readdir(path.join(config.dataDir, 'reports'));
    assert.ok(!remaining.includes(orphan));
    for (const accepted of before) assert.ok(remaining.includes(accepted));
  });

  await t.test('accepts PDF/image/Office signatures but rejects disguised Office macros and expansion bombs', async () => {
    const valid = await post().field('description', 'Documents and image')
      .attach('files', Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'), 'evidence.pdf')
      .attach('files', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1EAAAAASUVORK5CYII=', 'base64'), 'image.png')
      .attach('files', await officeFile(), 'evidence.docx');
    assert.equal(valid.status, 202);
    await worker.tick();
    const macro = await post().field('description', 'report').attach('files', await officeFile({ 'word/vbaProject.bin': Buffer.from('macro payload') }), 'disguised.docx');
    assert.equal(macro.status, 415);
    const expanded = await post().field('description', 'report').attach('files', await officeFile({ 'word/large.xml': Buffer.alloc(51_000_000, 'a') }), 'expanded.docx');
    assert.equal(expanded.status, 415); await clean();
  });

  await t.test('accepts files exactly at the advertised individual, combined and count limits', async () => {
    const limited = await createApp({ config: { ...config, maxFileBytes: 8, maxTotalBytes: 10, maxFiles: 2 }, db });
    assert.equal((await post(limited).field('description', 'boundary').attach('files', Buffer.from('12345678'), 'a.txt')).status, 202);
    assert.equal((await post(limited).field('description', 'boundary').attach('files', Buffer.from('12345'), 'a.txt').attach('files', Buffer.from('67890'), 'b.txt')).status, 202);
    await worker.tick(); await worker.tick();
  });

  await t.test('preserves Unicode filenames through multipart parsing and MIME encoding', async () => {
    const response = await post().field('description', 'Unicode evidence').attach('files', Buffer.from('evidence'), 'résumé-α.txt');
    assert.equal(response.status, 202);
    await worker.tick();
    const message = await simpleParser(await readFile(path.join(config.captureDir, `${response.body.formId}.eml`)));
    assert.equal(message.attachments[0].filename, 'résumé-α.txt');
  });

  await t.test('an acknowledged-late database write retains evidence and is found on retry', async () => {
    const key = randomUUID();
    const uncertain = await createApp({ config, db: { ...db, save: async input => { await db.save(input); throw new Error('Lost acknowledgement'); } }, logger: { error() {} } });
    const submitTo = target => post(target, key).field('description', 'Database acknowledgement lost').attach('files', Buffer.from('Keep this evidence'), 'retained.txt');
    assert.equal((await submitTo(uncertain)).status, 500);
    const retry = await submitTo(app);
    assert.equal(retry.status, 202);
    await worker.tick();
    const mail = await simpleParser(await readFile(path.join(config.captureDir, `${retry.body.formId}.eml`)));
    assert.equal(mail.attachments[0].content.toString(), 'Keep this evidence');
  });

  await t.test('simultaneous workers cannot claim the same notification', async () => {
    await post().field('description', 'Atomic worker lease');
    let release;
    let started;
    const gate = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    const first = createWorker({ config, db, mailer: { async send(record) { started(); await gate; await mailer.send(record); } } });
    const pending = first.tick();
    await entered;
    const second = createWorker({ config, db, mailer });
    assert.equal(await second.tick(), false);
    release(); await pending;
  });

  await t.test('a lost worker lease can be reclaimed after restart', async () => {
    const response = await post().field('description', 'Recover crashed worker');
    const clock = new Date(Date.now() + 1000);
    const abandonedClaim = await db.claim(clock);
    assert.equal(String(abandonedClaim._id), response.body.formId);
    const recovered = createWorker({ config, db, mailer, now: () => new Date(clock.getTime() + 301_000) });
    assert.equal(await recovered.tick(), true);
    assert.ok((await readdir(config.captureDir)).includes(`${response.body.formId}.eml`));
  });

  await t.test('exhausted retries become visible failures and can be explicitly requeued', async () => {
    const response = await post().field('description', 'Persistent SMTP failure');
    let clock = new Date(Date.now() + 1000);
    const failing = createWorker({ config, db, now: () => clock, mailer: { async send() { throw new Error('SMTP outage'); } }, logger: { error() {} } });
    for (let i = 0; i < config.maxMailAttempts; i++) { await failing.tick(); clock = new Date(clock.getTime() + 3600_000); }
    const status = (await db.listNotifications()).find(item => String(item._id) === response.body.formId);
    assert.equal(status.notification.state, 'failed');
    assert.equal(status.notification.attempts, 5);
    assert.equal(await failing.tick(), false);
    assert.equal((await db.retry(response.body.formId)).modifiedCount, 1);
    await worker.tick();
    assert.ok(!(await db.listNotifications()).some(item => String(item._id) === response.body.formId));
  });
});
