import { randomBytes } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export function logEvent(logger, level, event, fields = {}) {
  logger[level]?.(JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }));
}

const routes = { '/api/form/new': 'report', '/api/help': 'help', '/api/config': 'configuration', '/health/live': 'liveness', '/health/ready': 'readiness', '/health/notifications': 'notifications', '/': 'home', '/help': 'help_page' };
export function requestDiagnostics(config, logger) {
  return (req, res, next) => {
    const started = performance.now();
    const requestId = randomBytes(16).toString('hex');
    const route = routes[req.path] || 'other';
    // Generate our own ID: do not log client-supplied correlation headers.
    res.set('X-Request-ID', requestId);
    let recorded = false;
    const finished = () => {
      if (recorded) return;
      recorded = true;
      const durationMs = Math.round(performance.now() - started);
      const aborted = !res.writableFinished;
      const status = aborted ? 499 : res.statusCode;
      const slow = durationMs >= (config.slowRequestMs ?? 10000);
      if (!aborted && status < 500 && !slow) return;
      logEvent(logger, status >= 500 ? 'error' : 'warn', aborted ? 'http_aborted' : status >= 500 ? 'http_failure' : 'http_slow', {
        requestId, route, status, durationMs,
        ...(req.diagnosticStage ? { stage: req.diagnosticStage } : {}),
      });
    };
    res.once('finish', finished); res.once('close', finished);
    next();
  };
}

export function startRuntimeDiagnostics(config, db, logger = console) {
  if (!config.opsLogIntervalMs) return () => {};
  const lag = monitorEventLoopDelay({ resolution: 20 });
  lag.enable();
  const timer = setInterval(() => {
    const memory = process.memoryUsage();
    logEvent(logger, 'info', 'runtime_sample', {
      pid: process.pid, uptimeSeconds: Math.round(process.uptime()),
      rssBytes: memory.rss, heapUsedBytes: memory.heapUsed,
      eventLoopP99Ms: Math.round(lag.percentile(99) / 1e6), databaseReady: db.healthy(),
    });
    lag.reset();
  }, config.opsLogIntervalMs);
  timer.unref();
  return () => { clearInterval(timer); lag.disable(); };
}
