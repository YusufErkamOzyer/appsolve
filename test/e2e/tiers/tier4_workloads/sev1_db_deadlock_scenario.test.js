/**
 * Tier 4: Real-World Application Scenarios - SEV-1 Checkout Database Deadlock Scenario
 * Fulfills Acceptance Criterion 3:
 * Injects checkout deadlock, captures 504 timeout and SEV-1 telemetry, asserts manual_command_only guardrail,
 * executes inspect_db_locks diagnostic, executes kill_db_locks remediation, and verifies checkout recovery.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerSev1DbDeadlockScenarioTests() {
  describe('Tier 4: SEV-1 Checkout Database Deadlock & SRE Bridge Remediation Scenario', () => {
    it('should inject DB deadlock, produce SEV-1 incident, diagnose via bridge, kill blocking transaction, and restore checkout', async () => {
      // 1. Inject SEV-1 Deadlock chaos
      const lockRes = await client.post('/api/chaos/lock-checkout', {});
      expect(lockRes.status).toBe(200);

      const cartId = `cart_sev1_scen_${Date.now()}`;
      await client.post('/api/cart/items', { cart_id: cartId, product_id: 1, quantity: 1 });

      // 2. Checkout times out with HTTP 504 DB_LOCK
      const chkTimeoutRes = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '100 Critical Outage Ave',
        payment_method: 'card'
      });
      expect(chkTimeoutRes.status).toBe(504);
      expect(chkTimeoutRes.body.error).toBe('DB_LOCK_TIMEOUT');

      // 3. Telemetry Signal emitted to Appsolve
      const telemetryRes = await client.sendTelemetry({
        service_slug: 'checkout',
        error_code: 'ERR_DB_LOCK_TIMEOUT',
        message: 'SQLITE_BUSY: database table payment_records locked waiting on PID 4821',
        severity: 'sev1',
        raw_payload: {
          stack_trace: 'Error: SQLITE_BUSY: database is locked\n    at acquirePaymentRowLock (/quickcart/backend/src/db/locks.ts:38:11)',
          source_file: 'quickcart/backend/src/db/locks.ts',
          line_number: 38,
          context: { blocking_pid: 4821, table: 'payment_records' }
        }
      });

      expect(telemetryRes.status).toBe(201);
      const incident = telemetryRes.body.incident;
      expect(incident.severity).toBe('sev1');
      // SEV-1 Guardrail: manual_command_only (Full Autonomy Lock!)
      expect(incident.autonomy_mode).toBe('manual_command_only');

      // 4. War Room Diagnostic: Inspect database locks via SRE bridge
      const inspectRes = await client.bridgeExec('inspect_db_locks');
      expect(inspectRes.status).toBe(200);
      expect(inspectRes.body.data.active_locks).toBe(1);
      expect(inspectRes.body.data.blocking_pid).toBe(4821);

      // 5. War Room Remediation: Kill blocking locks via SRE bridge
      const killRes = await client.bridgeExec('kill_db_locks');
      expect(killRes.status).toBe(200);
      expect(killRes.body.data.pool_reset).toBe(true);

      // 6. Normal checkout restored to HTTP 200 OK
      const chkRecoveryRes = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '100 Critical Outage Ave',
        payment_method: 'card'
      });
      expect(chkRecoveryRes.status).toBe(200);
      expect(chkRecoveryRes.body.order_uuid).toBeDefined();
      expect(chkRecoveryRes.body.status).toBe('paid');
    });
  });
}

module.exports = { registerSev1DbDeadlockScenarioTests };
