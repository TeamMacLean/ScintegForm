import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { checkHealth } from '../scripts/healthcheck.js';

test('monitor distinguishes a public 502 from a database-readiness failure without storing response bodies', async t => {
  let publicStatus = 502;
  let ready = true;
  const server = http.createServer((req, res) => {
    if (req.url === '/') { res.writeHead(publicStatus); res.end('private upstream error details'); }
    else { res.writeHead(req.url === '/health/ready' && !ready ? 503 : 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ status: req.url === '/health/live' ? 'ok' : ready ? 'ready' : 'unavailable' })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let result = await checkHealth({ publicOrigin: origin, localOrigin: origin });
  assert.equal(result.assessment, 'public_path_failure');
  assert.equal(result.checks.public.status, 502); assert.equal(result.checks.liveness.ok, true);
  assert.doesNotMatch(JSON.stringify(result), /private upstream/);
  ready = false;
  result = await checkHealth({ publicOrigin: origin, localOrigin: origin });
  assert.equal(result.assessment, 'app_not_ready');
  ready = true; publicStatus = 200;
  result = await checkHealth({ publicOrigin: origin, localOrigin: origin });
  assert.equal(result.ok, true); assert.equal(result.assessment, 'healthy');
});

test('monitor bounds timeouts and rejects URLs containing credentials or paths', async t => {
  const server = http.createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const result = await checkHealth({ publicOrigin: `http://127.0.0.1:${server.address().port}`, localOrigin: null, timeoutMs: 50 });
  assert.equal(result.ok, false); assert.equal(result.checks.public.error, 'TIMEOUT');
  await assert.rejects(checkHealth({ publicOrigin: 'https://user:secret@example.invalid' }), /origin/);
  await assert.rejects(checkHealth({ publicOrigin: 'https://example.invalid/private?query=secret' }), /origin/);
});
