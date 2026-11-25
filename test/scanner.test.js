import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanFile } from '../server/uploads.js';

test('scanner process results are handled without exposing raw diagnostics', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-scan-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const command = path.join(dir, 'scanner');
  for (const [code, status] of [[0, null], [1, 422], [2, 503]]) {
    await writeFile(command, `#!/bin/sh\nprintf 'private diagnostic' >&2\nexit ${code}\n`, { mode: 0o700 });
    const result = scanFile(dir, { scanMode: 'clamav', scanCommand: command });
    if (status) await assert.rejects(result, error => error.status === status && !error.message.includes('private diagnostic'));
    else await result;
  }
  await assert.rejects(scanFile(dir, { scanMode: 'clamav', scanCommand: path.join(dir, 'missing') }), { status: 503 });
});

test('scanner output limit kills a process that ignores SIGTERM', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-scan-limit-'));
  const command = path.join(dir, 'scanner');
  let deadline;
  t.after(async () => {
    clearTimeout(deadline);
    try { process.kill(Number(await readFile(path.join(dir, 'pid'), 'utf8')), 'SIGKILL'); } catch { /* already stopped */ }
    await rm(dir, { recursive: true, force: true });
  });
  await writeFile(command, `#!${process.execPath}\nconst fs = require('node:fs');\nprocess.on('SIGTERM', () => {});\nprocess.stderr.on('error', () => {});\nfs.writeFileSync(process.argv.at(-1) + '/pid', String(process.pid));\nsetInterval(() => {}, 1000);\nprocess.stderr.write('x'.repeat(128000));\n`, { mode: 0o700 });
  await assert.rejects(Promise.race([
    scanFile(dir, { scanMode: 'clamav', scanCommand: command }),
    new Promise((resolve, reject) => { deadline = setTimeout(() => reject(new Error('Scanner was not stopped within the deadline')), 3000); }),
  ]), { status: 503 });
  const pid = Number(await readFile(path.join(dir, 'pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
});
