import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../server/config.js';

test('missing mail mode captures mail; legacy production recipients cannot enable delivery', () => {
  const config = loadConfig({ EMAIL_RECIPIENTS: 'production', WEBMASTER_TESTING: 'false' });
  assert.equal(config.mailMode, 'capture');
  assert.deepEqual(config.recipients, ['deeks@nbi.ac.uk']);
});

test('test mode cannot route to another address', () => {
  assert.throws(() => loadConfig({ MAIL_MODE: 'test', TEST_EMAIL: 'someone@example.org' }), /deeks/);
});

test('production requires explicit recipients, origin, database and scanning', () => {
  assert.throws(() => loadConfig({ MAIL_MODE: 'production' }), /required/);
});

test('production evidence needs an absolute DATA_DIR outside the application directory', () => {
  const production = { MAIL_MODE: 'production', MONGODB_URI: 'mongodb://localhost/test', PUBLIC_ORIGIN: 'https://scinteg.example.invalid', REPORT_RECIPIENTS: 'investigator@example.invalid', WEBMASTER_EMAIL: 'support@example.invalid', SMTP_HOST: 'smtp.example.invalid' };
  assert.throws(() => loadConfig(production), /DATA_DIR/);
  assert.throws(() => loadConfig({ ...production, DATA_DIR: 'var/production' }), /DATA_DIR/);
  assert.throws(() => loadConfig({ ...production, DATA_DIR: fileURLToPath(new URL('../var/production', import.meta.url)) }), /DATA_DIR/);
  assert.equal(loadConfig({ ...production, DATA_DIR: '/var/lib/scinteg/data' }).dataDir, path.join(realpathSync('/var'), 'lib/scinteg/data'));
});

test('private evidence cannot be configured under the public web directory', () => {
  assert.throws(() => loadConfig({ DATA_DIR: './public/evidence' }), /public/);
});

test('invalid limits and insecure production scanning fail at startup', () => {
  assert.throws(() => loadConfig({ MAX_FILES: 'NaN' }), /MAX_FILES/);
  assert.throws(() => loadConfig({ MAX_TOTAL_BYTES: '100', MAX_FILE_BYTES: '101' }), /MAX_FILE_BYTES/);
  assert.throws(() => loadConfig({ MAIL_MODE: 'production', MONGODB_URI: 'mongodb://localhost/test', PUBLIC_ORIGIN: 'https://scinteg.example.invalid', UPLOAD_SCAN_MODE: 'disabled' }), /clamav/);
});
