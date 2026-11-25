import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from '../server/config.js';
import { createMailer } from '../server/mail.js';
import { createOperatorAlerts } from '../server/alerts.js';

function origin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Monitor URL must be a valid HTTP(S) origin.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Monitor URL must be an HTTP(S) origin without credentials, path or query.');
  return url.origin;
}
async function probe(base, route, expectedStatus, timeoutMs) {
  const started = performance.now();
  let reader;
  try {
    const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(timeoutMs), redirect: 'manual', headers: { 'User-Agent': 'Scinteg-healthcheck/1' } });
    let ok = response.status === 200;
    if (ok && expectedStatus) {
      // Health endpoints are tiny. Bound parsing and never retain/log response bodies.
      reader = response.body.getReader();
      let length = 0;
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 1024) { ok = false; break; }
        chunks.push(value);
      }
      if (ok) { try { ok = JSON.parse(Buffer.concat(chunks)).status === expectedStatus; } catch { ok = false; } }
    } else await response.body?.cancel();
    return { ok, status: response.status, durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    const code = error.name === 'TimeoutError' ? 'TIMEOUT' : ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET'].includes(error.cause?.code) ? error.cause.code : 'NETWORK_OR_TLS_ERROR';
    return { ok: false, error: code, durationMs: Math.round(performance.now() - started) };
  } finally { await reader?.cancel().catch(() => {}); }
}

export async function checkHealth({ publicOrigin, localOrigin = null, timeoutMs = 3000 }) {
  const publicBase = origin(publicOrigin);
  const localBase = localOrigin ? origin(localOrigin) : null;
  const specs = [['public', publicBase, '/', null]];
  if (localBase) specs.push(['liveness', localBase, '/health/live', 'ok'], ['readiness', localBase, '/health/ready', 'ready']);
  // Failed or overdue report emails: checked locally when possible, otherwise through the proxy.
  specs.push(['notifications', localBase || publicBase, '/health/notifications', 'ok']);
  const checks = Object.fromEntries(await Promise.all(specs.map(async ([name, base, route, expected]) => [name, await probe(base, route, expected, timeoutMs)])));
  const ok = Object.values(checks).every(result => result.ok);
  const assessment = ok ? 'healthy'
    : localBase && !checks.liveness.ok ? 'app_unreachable_or_unresponsive'
    : localBase && !checks.readiness.ok ? 'app_not_ready'
    : !checks.public.ok ? 'public_path_failure' : 'notifications_need_attention';
  return { time: new Date().toISOString(), event: 'health_sample', ok, assessment, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.slice(2).some(arg => !['--watch', '--alert'].includes(arg))) throw new Error('Usage: npm run monitor [-- --watch --alert]');
  const publicOrigin = process.env.MONITOR_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN;
  if (!publicOrigin) throw new Error('Set MONITOR_PUBLIC_ORIGIN to the public site origin.');
  const localOrigin = process.env.MONITOR_LOCAL_ORIGIN === 'off' ? null : process.env.MONITOR_LOCAL_ORIGIN || 'http://127.0.0.1:3000';
  const interval = Number(process.env.MONITOR_INTERVAL_MS || 60000);
  if (!Number.isSafeInteger(interval) || interval < 10000 || interval > 3600000) throw new Error('MONITOR_INTERVAL_MS must be between 10000 and 3600000.');
  const watch = process.argv.includes('--watch');
  const mailer = process.argv.includes('--alert') ? createMailer(loadConfig()) : null;
  const alerts = mailer ? await createOperatorAlerts({ config: loadConfig(), mailer, channel: 'monitor' }) : null;
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
  do {
    const sample = await checkHealth({ publicOrigin, localOrigin });
    console.info(JSON.stringify(sample));
    if (alerts) {
      try {
        if (!sample.ok) await alerts.notify(sample.assessment === 'notifications_need_attention' ? 'NOTIFICATIONS_NEED_ATTENTION' : 'APP_UNAVAILABLE');
        await alerts.flush();
      } catch { console.error('operator_alert_delivery_failed'); }
    }
    if (!watch) { process.exitCode = sample.ok ? 0 : 1; break; }
    await delay(interval, undefined, { signal: controller.signal }).catch(() => {});
  } while (!controller.signal.aborted);
  mailer?.close();
}
