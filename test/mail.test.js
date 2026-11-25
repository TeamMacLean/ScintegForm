import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mail.js';

test('captured report escapes HTML and directs every envelope recipient to the test inbox', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-mail-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const mailer = createMailer(loadConfig({ DATA_DIR: dir }));
  const result = await mailer.send({ _id: '0123456789abcdef01234567', kind: 'report', description: '<img src="https://evil.invalid/"> & evidence', files: [], to: 'production@example.org', bcc: 'other@example.org' });
  assert.deepEqual(result.accepted, ['deeks@nbi.ac.uk']);
  const files = await readdir(path.join(dir, 'mail'));
  const message = await simpleParser(await readFile(path.join(dir, 'mail', files[0])));
  assert.equal(message.to.text, 'deeks@nbi.ac.uk');
  assert.equal(message.bcc, undefined);
  assert.equal(message.cc, undefined);
  assert.match(message.subject, /^\[TEST\]/);
  assert.ok(message.html.includes('&lt;img'));
  assert.ok(!message.html.includes('<img'));
  assert.match(message.text, /& evidence/);
});

test('real SMTP envelopes in test mode contain only deeks, for reports and help', async t => {
  const received = [];
  const server = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => { received.push({ envelope: session.envelope, raw: Buffer.concat(chunks) }); callback(); });
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const config = loadConfig({ MAIL_MODE: 'test', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.server.address().port), SMTP_REQUIRE_TLS: 'false', REPORT_RECIPIENTS: 'production@example.invalid', WEBMASTER_EMAIL: 'admin@example.invalid', WEBMASTER_TESTING: 'false' });
  const mailer = createMailer(config);
  t.after(() => mailer.close());
  for (const kind of ['report', 'help']) {
    await mailer.send({ _id: '0123456789abcdef01234567', kind, description: 'Synthetic SMTP check', subject: 'Help', files: [], to: 'wrong@example.invalid', cc: 'wrong@example.invalid', bcc: 'wrong@example.invalid', envelope: { to: ['wrong@example.invalid'] } });
  }
  assert.equal(received.length, 2);
  for (const item of received) {
    assert.deepEqual(item.envelope.rcptTo.map(recipient => recipient.address), ['deeks@nbi.ac.uk']);
    const message = await simpleParser(item.raw);
    assert.equal(message.to.text, 'deeks@nbi.ac.uk');
    assert.equal(message.cc, undefined); assert.equal(message.bcc, undefined);
    assert.match(message.subject, /^\[TEST\]/);
  }
});

test('partial SMTP acceptance is surfaced for operator review', async t => {
  const server = new SMTPServer({
    authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
    onRcptTo(address, session, callback) { callback(address.address.startsWith('reject') ? Object.assign(new Error('Rejected test recipient'), { responseCode: 550 }) : undefined); },
    onData(stream, session, callback) { stream.resume(); stream.on('end', callback); },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const config = loadConfig({ MAIL_MODE: 'production', PUBLIC_ORIGIN: 'https://scinteg.example.invalid', MONGODB_URI: 'mongodb://127.0.0.1/scintegform_test', REPORT_RECIPIENTS: 'accept@example.invalid,reject@example.invalid', WEBMASTER_EMAIL: 'support@example.invalid', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.server.address().port), SMTP_REQUIRE_TLS: 'false' });
  const mailer = createMailer(config);
  t.after(() => mailer.close());
  await assert.rejects(mailer.send({ _id: '0123456789abcdef01234567', kind: 'report', description: 'Synthetic partial acceptance test', files: [] }), { code: 'PARTIAL_DELIVERY' });
});
