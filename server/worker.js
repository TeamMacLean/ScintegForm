// Record an error code such as ECONNECTION or EENVELOPE_550 so operators can tell a
// relay refusal from a TLS or missing-file problem. Never SMTP response text, report
// contents, filenames or addresses.
function deliveryError(error) {
  const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{1,39}$/.test(error.code) ? error.code : 'DELIVERY_FAILED';
  return Number.isInteger(error?.responseCode) ? `${code}_${error.responseCode}` : code;
}

export function createWorker({ config, db, mailer, now = () => new Date(), logger = console, onIssue = () => {} }) {
  let running;
  let timer;
  let completion;
  const issue = (code, record) => {
    try { Promise.resolve(onIssue(code, String(record._id))).catch(() => logger.error('operator_alert_record_failed')); }
    catch { logger.error('operator_alert_record_failed'); }
  };
  async function persistCompletion() {
    try {
      const result = await db.finish(completion.record, completion.fields);
      if (result.matchedCount === 0) logger.error('notification_completion_already_applied_or_lease_changed');
      completion = undefined;
    } catch (error) {
      if (!completion.reported) { issue('NOTIFICATION_STATE_UNCERTAIN', completion.record); completion.reported = true; }
      // Keep the known outcome in memory. Retrying this write must never resend mail.
      throw error;
    }
  }
  async function processOne() {
    if (completion) { await persistCompletion(); return true; }
    const record = await db.claim(now());
    if (!record) return false;
    let fields;
    try {
      await mailer.send(record);
      fields = { state: 'sent', sentAt: now(), lastError: null };
    } catch (error) {
      const terminal = record.notification.attempts >= config.maxMailAttempts || error.code === 'PARTIAL_DELIVERY';
      const lastError = deliveryError(error);
      fields = {
        state: terminal ? 'failed' : 'pending',
        lastError,
        nextAttemptAt: new Date(now().getTime() + Math.min(3600_000, 30_000 * 2 ** (record.notification.attempts - 1))),
      };
      issue(terminal ? 'NOTIFICATION_FAILED' : 'NOTIFICATION_RETRYING', record);
      logger.error('notification_delivery_failed', { id: String(record._id), terminal, error: lastError });
    }
    completion = { record, fields };
    await persistCompletion();
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
    async stop() { clearInterval(timer); timer = undefined; await running; if (completion) await persistCompletion(); },
  };
}
