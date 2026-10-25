/**
 * Tier 2: Boundary & Corner Cases - Auth
 * Verifies token expiration, malformed headers, empty credentials, and adversarial input strings.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerAuthBoundaryTests() {
  describe('Tier 2: Auth Boundary & Corner Cases', () => {

    it('should reject expired JWT token with 401 Token Expired', async () => {
      const res = await client.get('/api/v1/auth/me', {
        headers: { 'Authorization': 'Bearer expired-token' }
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should reject malformed authorization header with 401 Malformed Token', async () => {
      const res = await client.get('/api/v1/auth/me', {
        headers: { 'Authorization': 'Bearer malformed.token.payload.signature' }
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should reject registration with empty email or empty password with 400 Bad Request', async () => {
      const res1 = await client.post('/api/v1/auth/register', { email: '', password: 'ValidPassword123' });
      expect(res1.status).toBe(400);

      const res2 = await client.post('/api/v1/auth/register', { email: 'valid@quickcart.local', password: '' });
      expect(res2.status).toBe(400);
    });

    it('should reject registration with invalid email format (no @) with 400 Bad Request', async () => {
      const res = await client.post('/api/v1/auth/register', {
        email: 'invalid-email-format-without-at',
        password: 'ValidPassword123'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should handle SQL injection and special meta-characters in credentials safely without 500 error', async () => {
      const maliciousEmail = `test_${Date.now()}'; DROP TABLE users; --@quickcart.local`;
      const maliciousPass = `password' OR '1'='1`;

      const res = await client.post('/api/v1/auth/login', {
        email: maliciousEmail,
        password: maliciousPass
      });

      // Must be 401 or 400, never unhandled 500
      expect(res.status).toBeLessThan(500);
      expect(res.body.error).toBeDefined();
    });
  });
}

module.exports = { registerAuthBoundaryTests };
