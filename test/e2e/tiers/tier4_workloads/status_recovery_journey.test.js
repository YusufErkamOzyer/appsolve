/**
 * Tier 4: Real-World Application Scenarios - Mobile Status Recovery Journey
 * Fulfills Acceptance Criterion 5:
 * Verifies that Appsolve's public status API correctly reflects subsystem outages (e.g. major_outage during SEV-1),
 * allows clients to poll status changes, and returns to all_operational upon resolution.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerStatusRecoveryJourneyTests() {
  describe('Tier 4: Mobile Client Status Polling & Outage Recovery Journey', () => {
    it('should transition status from all_operational to major_outage during deadlock and recover to all_operational post-remediation', async () => {
      // 1. Initial State: all_operational
      const initialStatusRes = await client.get('/api/v1/services');
      expect(initialStatusRes.status).toBe(200);
      expect(initialStatusRes.body.system_status).toBe('all_operational');

      // 2. Deadlock injected -> triggers major_outage
      await client.post('/api/chaos/lock-checkout', {});

      const degradedStatusRes = await client.get('/api/v1/services');
      expect(degradedStatusRes.status).toBe(200);
      expect(degradedStatusRes.body.system_status).toBe('major_outage');

      // Verify checkout service specifically marked as outage
      const checkoutService = degradedStatusRes.body.services.find(s => s.slug === 'checkout');
      expect(checkoutService).toBeDefined();
      expect(checkoutService.status).toBe('outage');

      // 3. Remediate via SRE Bridge kill_db_locks
      const killRes = await client.bridgeExec('kill_db_locks');
      expect(killRes.status).toBe(200);

      // 4. Recovery: System status returns to all_operational
      const recoveredStatusRes = await client.get('/api/v1/services');
      expect(recoveredStatusRes.status).toBe(200);
      expect(recoveredStatusRes.body.system_status).toBe('all_operational');

      const restoredCheckoutService = recoveredStatusRes.body.services.find(s => s.slug === 'checkout');
      expect(restoredCheckoutService.status).toBe('operational');
    });
  });
}

module.exports = { registerStatusRecoveryJourneyTests };
