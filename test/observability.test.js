import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

test('server failures have correlation IDs and structured diagnostics without submitted information', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'scinteg-logs-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const lines = [];
  const logger = { info: line => lines.push(line), warn: line => lines.push(line), error: line => lines.push(line) };
  const app = await createApp({ config: loadConfig({ DATA_DIR: dir }), db: { healthy: () => false }, logger });
  const response = await request(app).post('/api/form/new?secret=private-query').set('X-Forwarded-For', '192.0.2.99').set('X-Request-ID', 'private-client-header').send({ description: 'private-report-content' });
  assert.equal(response.status, 503);
  assert.match(response.headers['x-request-id'], /^[a-f0-9]{32}$/);
  const events = lines.map(line => JSON.parse(line));
  const failed = events.find(event => event.event === 'http_failure');
  assert.equal(failed.requestId, response.headers['x-request-id']);
  assert.equal(failed.route, 'report'); assert.equal(failed.status, 503);
  assert.ok(Number.isFinite(failed.durationMs)); assert.ok(failed.time);
  assert.doesNotMatch(lines.join('\n'), /private-|192\.0\.2\.99/);
});
