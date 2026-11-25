import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { temporaryMongo } from './helpers.js';

test('production entry point starts, accepts a report, shuts down and reopens its durable queue', async t => {
  const mongo = await temporaryMongo();
  const dataDir = path.join(mongo.dir, 'app');
  let child;
  let processOutput = '';
  async function stop() {
    if (child && child.exitCode === null) {
      const closed = once(child, 'exit'); child.kill('SIGTERM');
      const [code] = await closed; assert.equal(code, 0);
    }
  }
  t.after(async () => { await stop(); await mongo.stop(); });
  async function start() {
    child = spawn(process.execPath, ['server/index.js'], { env: {
      PATH: process.env.PATH, PORT: '0', HOST: '127.0.0.1', MAIL_MODE: 'capture',
      MONGODB_URI: mongo.uri, DATA_DIR: dataDir, MIN_FREE_BYTES: '0', WORKER_INTERVAL_MS: '50', OPS_LOG_INTERVAL_MS: '50',
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    processOutput = '';
    child.stdout.on('data', data => { output += data; processOutput += data; });
    for (let n = 0; n < 100; n++) {
      const match = output.match(/127\.0\.0\.1:(\d+)/);
      if (match) return `http://127.0.0.1:${match[1]}`;
      if (child.exitCode !== null) throw new Error('Application exited before listening');
      await delay(50);
    }
    throw new Error('Application did not start');
  }
  const key = randomUUID();
  async function submit(origin) {
    const body = new FormData(); body.set('description', 'Synthetic restart test');
    body.append('files', new Blob(['restart evidence']), 'evidence.txt');
    const response = await fetch(`${origin}/api/form/new`, { method: 'POST', headers: { 'Idempotency-Key': key }, body });
    assert.equal(response.status, 202); return response.json();
  }
  const origin = await start();
  const first = await submit(origin);
  for (let n = 0; n < 100 && !processOutput.includes('runtime_sample'); n++) await delay(10);
  const sample = processOutput.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(event => event.event === 'runtime_sample');
  assert.ok(sample.rssBytes > 0); assert.ok(sample.heapUsedBytes > 0);
  assert.equal(sample.databaseReady, true); assert.ok(Number.isFinite(sample.eventLoopP99Ms));
  assert.doesNotMatch(processOutput, /Synthetic restart test|restart evidence/);
  await stop();
  const restarted = await start();
  const repeated = await submit(restarted);
  assert.equal(repeated.formId, first.formId);
  let mail;
  for (let n = 0; n < 100; n++) {
    try { mail = await readFile(path.join(dataDir, 'mail', `${first.formId}.eml`), 'utf8'); break; }
    catch { await delay(50); }
  }
  assert.match(mail || '', /deeks@nbi\.ac\.uk/);
  assert.equal((await readdir(path.join(dataDir, 'reports'))).length, 1);
});
