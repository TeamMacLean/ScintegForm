import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import request from 'supertest';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { temporaryMongo } from './helpers.js';
import { loadConfig } from '../server/config.js';
import { connectDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { createMailer } from '../server/mail.js';
import { createWorker } from '../server/worker.js';

test('production uploads without antivirus preserve validation, private original bytes and full email delivery', async t => {
  const mongo = await temporaryMongo();
  t.after(() => mongo.stop());
  const received = [];
  const smtp = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
    onData(stream, session, done) {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => { received.push({ to: session.envelope.rcptTo.map(r => r.address), raw: Buffer.concat(chunks) }); done(); });
    },
  });
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => smtp.close(resolve)));
  const config = loadConfig({ MAIL_MODE: 'production', ATTACHMENTS_ENABLED: 'true', UPLOAD_SCAN_MODE: 'disabled',
    // A successful upload proves no scanner is needed; this executable does not exist.
    CLAMSCAN_COMMAND: path.join(mongo.dir, 'no-scanner-installed'), MONGODB_URI: mongo.uri, DATA_DIR: path.join(mongo.dir, 'data'),
    PUBLIC_ORIGIN: 'https://synthetic.invalid', MIN_FREE_BYTES: '0', REPORT_RECIPIENTS: 'nick@example.invalid,debbie@example.invalid', WEBMASTER_EMAIL: 'deeks@nbi.ac.uk',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.server.address().port), SMTP_REQUIRE_TLS: 'false',
  });
  const db = await connectDatabase(config);
  t.after(() => db.close());
  const mailer = createMailer(config);
  t.after(() => mailer.close());
  const app = await createApp({ config, db, logger: { error() {} } });
  const key = randomUUID();
  const text = Buffer.from('Synthetic original attachment\n');
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
  const post = (target = app, id = randomUUID()) => request(target).post('/api/form/new').set('Idempotency-Key', id).field('description', 'Synthetic report');
  const submit = () => post(app, key).attach('files', text, 'evidence.txt').attach('files', pdf, 'evidence.pdf');
  const accepted = await submit();
  assert.equal(accepted.status, 202, accepted.text);
  assert.equal((await submit()).body.formId, accepted.body.formId);
  const record = await db.getNotification(accepted.body.formId);
  assert.equal(record.files.length, 2);
  for (const [index, original] of [text, pdf].entries()) {
    const file = path.join(config.dataDir, 'reports', accepted.body.formId, record.files[index].storageName);
    assert.deepEqual(await readFile(file), original);
    assert.equal((await stat(file)).mode & 0o077, 0);
  }
  const worker = createWorker({ config, db, mailer });
  await worker.tick();
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].to, ['nick@example.invalid', 'debbie@example.invalid', 'deeks@nbi.ac.uk']);
  const message = await simpleParser(received[0].raw);
  assert.deepEqual(message.attachments.map(file => file.content), [text, pdf]);
  assert.equal((await db.getNotification(accepted.body.formId)).notification.state, 'sent');

  assert.equal((await post().attach('files', text, 'disguised.pdf')).status, 415);
  assert.equal((await post().attach('files', text, 'blocked.exe')).status, 415);
  const limited = await createApp({ config: { ...config, maxFileBytes: 8, maxTotalBytes: 10 }, db, logger: { error() {} } });
  assert.equal((await post(limited).attach('files', text, 'large.txt')).status, 413);
  // Re-enabling ClamAV still fails closed when the scanner is missing.
  const scanning = await createApp({ config: { ...config, scanMode: 'clamav' }, db, logger: { error() {} } });
  assert.equal((await post(scanning).attach('files', text, 'evidence.txt')).status, 503);
  assert.deepEqual(await readdir(path.join(config.dataDir, 'quarantine')), []);
  assert.equal((await request(app).get('/api/config')).body.attachmentsEnabled, true);
});
