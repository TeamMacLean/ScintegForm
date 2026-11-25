// Record an error code such as ECONNECTION or EENVELOPE_550 so operators can tell a
// relay refusal from a TLS or missing-file problem. Never SMTP response text, report
// contents, filenames or addresses.
function deliveryError(error) {
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(error.code) ? error.code : 'DELIVERY_FAILED';
  return Number.isInteger(error?.responseCode) ? `${code}_${error.responseCode}` : code;
}

export function createWorker({ config, db, mailer, now = () => new Date(), logger = console }) {
  let running;
  let timer;
  async function processOne() {
    const record = await db.claim(now());
    if (!record) return false;
    try {
      await mailer.send(record);
      await db.finish(record, { state: 'sent', sentAt: now(), lastError: null });
    } catch (error) {
      const terminal = record.notification.attempts >= config.maxMailAttempts || error.code === 'PARTIAL_DELIVERY';
      const lastError = deliveryError(error);
      await db.finish(record, {
        state: terminal ? 'failed' : 'pending',
        lastError,
        nextAttemptAt: new Date(now().getTime() + Math.min(3600_000, 30_000 * 2 ** (record.notification.attempts - 1))),
      });
      logger.error('notification_delivery_failed', { id: String(record._id), terminal, error: lastError });
    }
    return true;
  }
  const tick = () => {
    if (!running) running = processOne().finally(() => { running = undefined; });
    return running;
  };
  return {
    tick,
    start() {
      if (timer) return;
      timer = setInterval(() => { tick().catch(() => logger.error('notification_worker_unavailable')); }, config.workerIntervalMs);
      timer.unref();
      tick().catch(() => logger.error('notification_worker_unavailable'));
    },
    async stop() { clearInterval(timer); timer = undefined; await running; },
  };
}
