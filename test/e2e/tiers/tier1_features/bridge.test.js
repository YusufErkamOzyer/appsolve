/**
 * Tier 1: Feature Coverage - Remote SRE Sandbox Bridge
 * Verifies authenticated bridge commands: lock inspection, lock termination, cache inspection, cache purging, health check, and source sync.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerBridgeTests() {
  describe('Tier 1: Remote SRE Sandbox Bridge Feature Coverage', () => {

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const res = await client.post('/api/bridge/v1/exec', {
        command: 'health_check'
      }, {
        headers: { 'Authorization': '' } // No auth token
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should execute inspect_db_locks and return lock table status', async () => {
      const res = await client.bridgeExec('inspect_db_locks');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.command).toBe('inspect_db_locks');
      expect(res.body.data).toBeDefined();
      expect(res.body.data.table).toBe('payment_records');
      expect(res.body.data.status).toBeDefined();
    });

    it('should execute kill_db_locks and release active locks', async () => {
      const res = await client.bridgeExec('kill_db_locks');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.command).toBe('kill_db_locks');
      expect(res.body.output).toBeDefined();
      expect(res.body.data.pool_reset).toBe(true);
    });

    it('should execute inspect_cache and return cache metrics', async () => {
      const res = await client.bridgeExec('inspect_cache');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.command).toBe('inspect_cache');
      expect(res.body.data.total_keys).toBeGreaterThanOrEqual(0);
      expect(res.body.data.memory_pressure).toBeDefined();
    });

    it('should execute purge_cache and evict all entries', async () => {
      // Prime some cache entries first
      await client.get('/api/v1/catalog/products');

      const res = await client.bridgeExec('purge_cache', { all: true });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.command).toBe('purge_cache');
      expect(res.body.data.current_pressure).toBe('NORMAL');
    });

    it('should execute health_check and return subsystem status 200', async () => {
      const res = await client.bridgeExec('health_check');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.command).toBe('health_check');
      expect(res.body.data.healthy).toBe(true);
      expect(res.body.data.catalog).toBe(200);
      expect(res.body.data.cart).toBe(200);
      expect(res.body.data.auth).toBe(200);
    });

    it('should execute sync_source and acknowledge file hot-reload', async () => {
      const res = await client.bridgeExec('sync_source', {
        target_file: 'src/services/couponService.ts',
        content: '// Hot patched coupon service'
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.command).toBe('sync_source');
      expect(res.body.data.status).toBe('synced_and_reloaded');
    });
  });
}

module.exports = { registerBridgeTests };
