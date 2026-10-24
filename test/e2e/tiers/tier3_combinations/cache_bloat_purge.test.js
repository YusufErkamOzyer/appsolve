/**
 * Tier 3: Cross-Feature Combinations - Cache Bloat to Telemetry to Bridge Purge
 * Verifies that cache bloat pressure triggers inspection and autonomous bridge purge.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerCacheBloatPurgeTests() {
  describe('Tier 3: Cache Bloat and SRE Bridge Purge Loop', () => {
    it('should inject cache bloat, inspect pressure via bridge, purge cache, and verify normal state', async () => {
      // 1. Inject cache bloat
      await client.post('/api/chaos/bloat-cache', {});

      // 2. Inspect cache via bridge
      const inspectRes = await client.bridgeExec('inspect_cache');
      expect(inspectRes.status).toBe(200);
      expect(inspectRes.body.data.bloat_count).toBeGreaterThan(5000);
      expect(inspectRes.body.data.memory_pressure).toContain('CRITICAL');

      // 3. Purge cache via bridge
      const purgeRes = await client.bridgeExec('purge_cache');
      expect(purgeRes.status).toBe(200);
      expect(purgeRes.body.data.current_pressure).toBe('NORMAL');

      // 4. Verify catalog still operational
      const catRes = await client.get('/api/v1/catalog/products');
      expect(catRes.status).toBe(200);
      expect(catRes.body.products.length).toBeGreaterThan(0);
    });
  });
}

module.exports = { registerCacheBloatPurgeTests };
