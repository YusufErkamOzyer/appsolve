/**
 * Tier 3: Cross-Feature Combinations - Code Error to Telemetry to Bridge Hot-Patch
 * Verifies that a cart calculation error produces telemetry and is remediated via SRE Bridge hot-sync.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerErrorTelemetryBridgeTests() {
  describe('Tier 3: Error Telemetry and SRE Bridge Hot-Patching Loop', () => {
    it('should capture coupon calculation failure in telemetry and restore functionality via bridge sync_source', async () => {
      // 1. Inject coupon bug
      await client.post('/api/chaos/inject-coupon-bug', {});

      const cartId = `cart_loop_${Date.now()}`;
      await client.post('/api/cart/items', { cart_id: cartId, product_id: 1, quantity: 1 });

      // 2. Trigger coupon calculation -> Expect 500 error & telemetry forward
      const errRes = await client.post('/api/cart/coupon', {
        cart_id: cartId,
        coupon_code: 'SAVE20'
      });
      expect(errRes.status).toBe(500);
      expect(errRes.body.telemetry_forwarded).toBe(true);

      // 3. Simulate Appsolve receiving signal and dispatching sync_source to Bridge
      const bridgeRes = await client.bridgeExec('sync_source', {
        target_file: 'src/services/couponService.ts',
        content: '// Corrected coupon calculation code'
      });
      expect(bridgeRes.status).toBe(200);
      expect(bridgeRes.body.status).toBe('success');

      // 4. Retry coupon calculation -> Expect 200 OK
      const retryRes = await client.post('/api/cart/coupon', {
        cart_id: cartId,
        coupon_code: 'SAVE20'
      });
      expect(retryRes.status).toBe(200);
      expect(retryRes.body.applied_coupon).toBe('SAVE20');
      expect(retryRes.body.discount).toBeGreaterThan(0);
    });
  });
}

module.exports = { registerErrorTelemetryBridgeTests };
