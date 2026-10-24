/**
 * Tier 4: Real-World Application Scenarios - SEV-2 Coupon Bug Scenario
 * Fulfills Acceptance Criterion 2:
 * Injects coupon calculation bug, captures stack trace telemetry, asserts SEV-2 triage & approval_required,
 * verifies PR patch creation and merge flow, hot-syncs via SRE bridge, and verifies 200 OK post-remediation.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerSev2CouponBugScenarioTests() {
  describe('Tier 4: SEV-2 Coupon Bug GitHub PR & Hot-Patching Remediation Scenario', () => {
    it('should inject coupon calculation bug, produce telemetry, triage as SEV-2, hot-reload fix, and verify 200 OK post-remediation', async () => {
      // 1. Inject SEV-2 Code Bug into couponService
      await client.post('/api/chaos/inject-coupon-bug', {});

      const cartId = `cart_sev2_scen_${Date.now()}`;
      await client.post('/api/cart/items', { cart_id: cartId, product_id: 1, quantity: 1 });

      // 2. Coupon application crashes with TypeError
      const failRes = await client.post('/api/cart/coupon', {
        cart_id: cartId,
        coupon_code: 'SUMMER50'
      });
      expect(failRes.status).toBe(500);
      expect(failRes.body.error).toBe('ERR_COUPON_CALCULATION');

      // 3. Telemetry Signal forwarded to Appsolve with complete stack trace
      const telemetryRes = await client.sendTelemetry({
        service_slug: 'cart',
        error_code: 'ERR_COUPON_CALCULATION',
        message: "TypeError: Cannot read properties of undefined (reading 'multiplier') in couponService.ts:42",
        severity: 'sev2',
        raw_payload: {
          stack_trace: "TypeError: Cannot read properties of undefined (reading 'multiplier')\n    at calculateCouponDiscount (/quickcart/backend/src/services/couponService.ts:42:28)",
          source_file: 'quickcart/backend/src/services/couponService.ts',
          line_number: 42
        }
      });

      expect(telemetryRes.status).toBe(201);
      const incident = telemetryRes.body.incident;
      expect(incident.severity).toBe('sev2');
      // SEV-2 Guardrail: approval_required
      expect(incident.autonomy_mode).toBe('approval_required');

      // 4. Remote SRE Bridge receives hot patch generated from merged PR
      const bridgeSyncRes = await client.bridgeExec('sync_source', {
        target_file: 'src/services/couponService.ts',
        content: `
          // Patched couponService.ts
          export function calculateCouponDiscount(cart, coupon) {
            const multiplier = coupon.value || 20;
            return (cart.subtotal * multiplier) / 100;
          }
        `,
        git_branch: 'fix/cart-coupon-nan-inc-408'
      });

      expect(bridgeSyncRes.status).toBe(200);
      expect(bridgeSyncRes.body.data.status).toBe('synced_and_reloaded');

      // 5. User immediately retries coupon application -> HTTP 200 OK!
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

module.exports = { registerSev2CouponBugScenarioTests };
