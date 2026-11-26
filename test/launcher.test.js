import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rootCertificates } from 'node:tls';

test('maintenance launcher loads the explicit environment and CA before Node starts; missing file fails closed', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-launcher-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'ca.pem'), rootCertificates[0]);
  const envFile = path.join(dir, 'service.env');
  await writeFile(envFile, `MAIL_MODE=test\nSMTP_HOST=synthetic.invalid\nDATA_DIR=${dir}/evidence\nNODE_EXTRA_CA_CERTS=${dir}/ca.pem\n`);
  const run = file => spawnSync(process.execPath, ['scripts/run.js', 'config:check', '--env-file', file], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  const result = run(envFile);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.mode, 'test'); assert.ok(config.extraCACertificatesLoaded >= 1);
  assert.deepEqual(config.recipients, ['deeks@nbi.ac.uk']);
  assert.notEqual(run(path.join(dir, 'missing.env')).status, 0);
});

test('launcher exits with its task even when a supervisor has active handles', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-launcher-supervisor-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const envFile = path.join(dir, 'service.env');
  await writeFile(envFile, `MAIL_MODE=capture\nDATA_DIR=${dir}/evidence\n`);
  const run = () => spawnSync(process.execPath, [
    '--import', 'data:text/javascript,setInterval(() => {}, 1000)',
    'scripts/run.js', 'config:check', '--env-file', envFile,
  ], { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 3000, killSignal: 'SIGKILL' });
  const success = run();
  assert.equal(success.status, 0, success.error?.message || success.stderr);
  await writeFile(envFile, 'MAIL_MODE=invalid\n');
  const failure = run();
  assert.equal(failure.status, 1, failure.error?.message || failure.stderr);
});
