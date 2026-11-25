import test from 'node:test';
import assert from 'node:assert/strict';
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

test('private evidence cannot be configured under the public web directory', () => {
  assert.throws(() => loadConfig({ DATA_DIR: './public/evidence' }), /public/);
});

test('invalid limits and insecure production scanning fail at startup', () => {
  assert.throws(() => loadConfig({ MAX_FILES: 'NaN' }), /MAX_FILES/);
  assert.throws(() => loadConfig({ MAX_TOTAL_BYTES: '100', MAX_FILE_BYTES: '101' }), /MAX_FILE_BYTES/);
  assert.throws(() => loadConfig({ MAIL_MODE: 'production', MONGODB_URI: 'mongodb://localhost/test', PUBLIC_ORIGIN: 'https://scinteg.example.invalid', UPLOAD_SCAN_MODE: 'disabled' }), /clamav/);
});
