/**
 * Tier 3: Cross-Feature Combinations - Deadlock to Telemetry to Bridge Kill Loop
 * Verifies that a checkout deadlock triggers telemetry and is remediated via SRE Bridge kill_db_locks.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerDeadlockTelemetryKillTests() {
  describe('Tier 3: Deadlock Telemetry and SRE Bridge Lock Killing Loop', () => {
    it('should catch checkout 504 deadlock, diagnose via bridge, kill lock, and restore checkout', async () => {
      // 1. Inject checkout database lock
      await client.post('/api/chaos/lock-checkout', {});

      const cartId = `cart_dl_loop_${Date.now()}`;
      await client.post('/api/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });

      // 2. Checkout times out
      const failRes = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '123 Locked Lane',
        payment_method: 'card'
      });
      expect(failRes.status).toBe(504);

      // 3. Inspect locks via SRE bridge
      const inspectRes = await client.bridgeExec('inspect_db_locks');
      expect(inspectRes.status).toBe(200);
      expect(inspectRes.body.data.active_locks).toBe(1);

      // 4. Kill locks via SRE bridge
      const killRes = await client.bridgeExec('kill_db_locks');
      expect(killRes.status).toBe(200);
      expect(killRes.body.data.pool_reset).toBe(true);

      // 5. Subsequent checkout succeeds
      const recoveryRes = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '123 Locked Lane',
        payment_method: 'card'
      });
      expect(recoveryRes.status).toBe(200);
      expect(recoveryRes.body.order_uuid).toBeDefined();
      expect(recoveryRes.body.status).toBe('paid');
    });
  });
}

module.exports = { registerDeadlockTelemetryKillTests };
