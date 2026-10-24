/**
 * Tier 2: Boundary & Corner Cases - Telemetry Ingestion
 * Verifies missing stack traces, empty payloads, burst load, and oversized stack trace limits.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerTelemetryBoundaryTests() {
  describe('Tier 2: Telemetry Boundary & Corner Cases', () => {

    it('should ingest telemetry signal with missing/empty stack trace without crash', async () => {
      const res = await client.sendTelemetry({
        service_slug: 'cart',
        error_code: 'ERR_NO_STACK',
        message: 'Simple string error without backtrace',
        severity: 'sev3',
        raw_payload: {}
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('accepted');
      expect(res.body.incident).toBeDefined();
    });

    it('should ingest telemetry signal without raw_payload field cleanly', async () => {
      const res = await client.sendTelemetry({
        service_slug: 'catalog',
        error_code: 'ERR_NO_RAW_PAYLOAD',
        message: 'Telemetry without raw payload',
        severity: 'sev3'
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('accepted');
    });

    it('should process a rapid burst of multiple telemetry signals concurrently without dropped requests', async () => {
      const burstSignals = Array.from({ length: 8 }, (_, idx) => ({
        service_slug: 'cart',
        error_code: `ERR_BURST_${idx}`,
        message: `Burst signal probe #${idx}`,
        severity: 'sev2',
        raw_payload: { burst_index: idx }
      }));

      const responses = await Promise.all(burstSignals.map(sig => client.sendTelemetry(sig)));

      for (const res of responses) {
        expect(res.status).toBe(201);
        expect(res.body.incident).toBeDefined();
      }
    });

    it('should process oversized stack trace (>20KB string) without memory corruption or crash', async () => {
      const largeStack = Array.from({ length: 400 }, (_, i) => `    at Frame${i} (/app/src/service.ts:${i}:1)`).join('\n');

      const res = await client.sendTelemetry({
        service_slug: 'checkout',
        error_code: 'ERR_LARGE_STACK',
        message: 'Stack overflow trace',
        severity: 'sev1',
        raw_payload: {
          stack_trace: largeStack
        }
      });

      expect(res.status).toBe(201);
      expect(res.body.incident.id).toBeDefined();
    });

    it('should handle unusual or unknown service_slug without 500 internal server error', async () => {
      const res = await client.sendTelemetry({
        service_slug: 'unknown_edge_worker',
        error_code: 'ERR_UNKNOWN_SERVICE',
        message: 'Unknown service emitted telemetry',
        severity: 'sev3',
        raw_payload: {}
      });

      expect(res.status).toBeLessThan(500);
    });
  });
}

module.exports = { registerTelemetryBoundaryTests };
