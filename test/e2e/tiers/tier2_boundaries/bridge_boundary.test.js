/**
 * Tier 2: Boundary & Corner Cases - Remote SRE Sandbox Bridge
 * Verifies token tampering, unknown commands, path traversal protection, and alternative auth headers.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerBridgeBoundaryTests() {
  describe('Tier 2: Remote SRE Bridge Boundary & Corner Cases', () => {

    it('should reject tampered or invalid bridge bearer token with 401 Unauthorized', async () => {
      const res = await client.post('/api/bridge/v1/exec', {
        command: 'health_check'
      }, {
        headers: { 'Authorization': 'Bearer wrong-secret-token' }
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED_BRIDGE_ACCESS');
    });

    it('should reject unrecognized/unknown bridge command with 400 Bad Request', async () => {
      const res = await client.bridgeExec('malicious_rm_rf_command', { force: true });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('UNKNOWN_BRIDGE_COMMAND');
    });

    it('should block directory traversal attempt (../../etc/passwd) in sync_source with 403 Forbidden', async () => {
      const res = await client.bridgeExec('sync_source', {
        target_file: '../../../../etc/passwd',
        content: 'malicious payload'
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN_PATH_TRAVERSAL');
    });

    it('should reject bridge execution with empty body with 400 Missing Command', async () => {
      const res = await client.post('/api/bridge/v1/exec', {}, {
        bridgeToken: 'quickcart-sre-secret-token'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MISSING_COMMAND');
    });

    it('should authenticate successfully using X-Appsolve-Bridge-Token header alternative', async () => {
      const res = await client.post('/api/bridge/v1/exec', {
        command: 'health_check'
      }, {
        headers: {
          'X-Appsolve-Bridge-Token': 'quickcart-sre-secret-token'
        }
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.command).toBe('health_check');
    });
  });
}

module.exports = { registerBridgeBoundaryTests };
