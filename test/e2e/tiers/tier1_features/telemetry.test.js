/**
 * Tier 1: Feature Coverage - Telemetry Forwarding & Ingestion
 * Verifies unhandled exception interception, structured payload parsing, stack trace capture, and Appsolve ingestion.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerTelemetryTests() {
  describe('Tier 1: Telemetry Forwarding Feature Coverage', () => {
    let createdIncidentId = null;

    it('should ingest structured telemetry signal and return HTTP 201 accepted', async () => {
      const res = await client.sendTelemetry({
        service_slug: 'cart',
        error_code: 'ERR_COUPON_CALCULATION',
        message: "TypeError: Cannot read properties of undefined (reading 'multiplier')",
        severity: 'sev2',
        raw_payload: {
          stack_trace: "TypeError: Cannot read properties of undefined (reading 'multiplier')\n    at calculateCouponDiscount (/quickcart/backend/src/services/couponService.ts:42:28)",
          source_file: 'quickcart/backend/src/services/couponService.ts',
          line_number: 42,
          context: { coupon_code: 'SUMMER50', cart_id: 'cart_991' }
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('accepted');
      expect(res.body.incident).toBeDefined();
      expect(res.body.incident.id).toBeDefined();
      expect(res.body.incident.incident_code).toBeDefined();
      createdIncidentId = res.body.incident.id;
    });

    it('should verify service_slug attribution in created incident', async () => {
      expect(createdIncidentId).toBeTruthy();
      const res = await client.sendTelemetry({
        service_slug: 'checkout',
        error_code: 'ERR_DB_LOCK_TIMEOUT',
        message: 'SQLITE_BUSY: database is locked waiting on PID 4821',
        severity: 'sev1',
        raw_payload: {
          stack_trace: 'Error: SQLITE_BUSY\n    at locks.ts:38:11',
          source_file: 'quickcart/backend/src/db/locks.ts',
          line_number: 38
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.incident.service_slug).toBe('checkout');
      expect(res.body.incident.severity).toBe('sev1');
    });

    it('should capture stack_trace, source_file, and line_number in raw_payload', async () => {
      const res = await client.sendTelemetry({
        service_slug: 'catalog',
        error_code: 'ERR_CACHE_BLOAT',
        message: 'Catalog cache size exceeded high watermark threshold',
        severity: 'sev3',
        raw_payload: {
          stack_trace: 'CacheBloatWarning: 15000 items in memory\n    at catalogCacheStore.ts:91:5',
          source_file: 'quickcart/backend/src/services/catalogCacheStore.ts',
          line_number: 91
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.incident.raw_payload).toBeDefined();
      expect(res.body.incident.raw_payload.source_file).toBe('quickcart/backend/src/services/catalogCacheStore.ts');
      expect(res.body.incident.raw_payload.line_number).toBe(91);
    });

    it('should map severity to autonomy_mode guardrail correctly (sev3 -> full_autonomy, sev1 -> manual_command_only)', async () => {
      // Test SEV-3
      const sev3Res = await client.sendTelemetry({
        service_slug: 'catalog',
        error_code: 'ERR_CACHE_PRESSURE',
        message: 'Memory pressure high',
        severity: 'sev3',
        raw_payload: {}
      });
      expect(sev3Res.status).toBe(201);
      expect(sev3Res.body.incident.autonomy_mode).toBe('full_autonomy');

      // Test SEV-1
      const sev1Res = await client.sendTelemetry({
        service_slug: 'checkout',
        error_code: 'ERR_DEADLOCK',
        message: 'Transaction deadlock',
        severity: 'sev1',
        raw_payload: {}
      });
      expect(sev1Res.status).toBe(201);
      expect(sev1Res.body.incident.autonomy_mode).toBe('manual_command_only');
    });

    it('should verify structured telemetry response carries telemetry_forwarded flag on error', async () => {
      // Induce coupon calculation error via chaos trigger
      await client.post('/api/chaos/inject-coupon-bug', {});
      const testCartId = `cart_err_telemetry_${Date.now()}`;
      await client.post('/api/cart/items', { cart_id: testCartId, product_id: 1, quantity: 1 });

      const errRes = await client.post('/api/cart/coupon', {
        cart_id: testCartId,
        coupon_code: 'SAVE20'
      });

      expect(errRes.status).toBe(500);
      expect(errRes.body.error).toBe('ERR_COUPON_CALCULATION');
      expect(errRes.body.telemetry_forwarded).toBe(true);
      expect(errRes.body.service).toBe('cart');

      // Reset chaos state
      await client.post('/api/chaos/reset', {});
    });

    it('should assign a standardized incident_code pattern (#INC-xxx)', async () => {
      const res = await client.sendTelemetry({
        service_slug: 'auth',
        error_code: 'ERR_JWT_VERIFICATION',
        message: 'Signature verification failure',
        severity: 'sev2',
        raw_payload: {}
      });

      expect(res.status).toBe(201);
      expect(res.body.incident.incident_code).toMatch(/^#INC-\d+$/);
    });
  });
}

module.exports = { registerTelemetryTests };
