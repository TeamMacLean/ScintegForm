import test from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { runVpnMailTest } from '../scripts/test-vpn-mail.js';

test('VPN mail check verifies SMTP without sending; delivery mode sends only synthetic mail to George', async t => {
  const received = [];
  const server = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], logger: false,
    onData(stream, session, done) {
      const parts = []; stream.on('data', part => parts.push(part));
      stream.on('end', () => { received.push({ envelope: session.envelope, raw: Buffer.concat(parts) }); done(); });
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const env = { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(server.server.address().port), SMTP_REQUIRE_TLS: 'false', MAIL_MODE: 'production', TEST_EMAIL: 'wrong@example.invalid', REPORT_RECIPIENTS: 'wrong@example.invalid' };
  const events = [];
  const log = record => events.push(record);
  await runVpnMailTest({ env, checkOnly: true, log });
  assert.equal(received.length, 0);
  assert.deepEqual(events.map(item => item.stage), ['dns', 'smtp', 'complete']);
  await runVpnMailTest({ env, log });
  assert.equal(received.length, 1);
  assert.deepEqual(received[0].envelope.rcptTo.map(item => item.address), ['deeks@nbi.ac.uk']);
  const mail = await simpleParser(received[0].raw);
  assert.match(mail.text, /SYNTHETIC VPN TEST/);
  assert.equal(mail.to.text, 'deeks@nbi.ac.uk');
  assert.equal(mail.cc, undefined); assert.equal(mail.bcc, undefined);
  assert.equal(mail.attachments[0].content.toString(), 'Synthetic attachment for Scinteg VPN delivery testing.\n');
});

test('VPN DNS failures identify the failing stage without leaking error details or sending', async () => {
  await assert.rejects(runVpnMailTest({ env: {}, log() {}, lookupHost: async () => { throw Object.assign(new Error('private resolver details'), { code: 'ENOTFOUND' }); } }), error => error.stage === 'dns' && error.code === 'ENOTFOUND' && !error.message.includes('private'));
});
