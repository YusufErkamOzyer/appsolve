/**
 * Tier 1: Feature Coverage - Auth Endpoints
 * Verifies core authentication features: registration, login, token verification, and session inspection.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerAuthTests() {
  describe('Tier 1: Auth Feature Coverage', () => {
    const timestamp = Date.now();
    const testEmail = `sre_user_${timestamp}@quickcart.local`;
    const testPassword = 'Password123!Secure';
    const testName = 'Alice SRE Engineer';
    let authToken = null;

    it('should register a new user and return 201 with JWT token', async () => {
      const res = await client.post('/api/v1/auth/register', {
        email: testEmail,
        password: testPassword,
        full_name: testName
      });

      expect(res.status).toBe(201);
      expect(res.body).toBeDefined();
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.full_name).toBe(testName);
      authToken = res.body.token;
    });

    it('should login with valid credentials and return 200 with JWT token', async () => {
      const res = await client.post('/api/v1/auth/login', {
        email: testEmail,
        password: testPassword
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      authToken = res.body.token;
    });

    it('should fetch user profile from GET /api/v1/auth/me with valid Bearer token', async () => {
      expect(authToken).toBeTruthy();
      const res = await client.get('/api/v1/auth/me', {
        token: authToken
      });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.full_name).toBe(testName);
    });

    it('should reject login attempt with invalid password with 401 Unauthorized', async () => {
      const res = await client.post('/api/v1/auth/login', {
        email: testEmail,
        password: 'CompletelyWrongPassword!'
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should reject GET /api/v1/auth/me without authorization header with 401 Unauthorized', async () => {
      const res = await client.get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('should reject duplicate user registration with 409 Conflict', async () => {
      const res = await client.post('/api/v1/auth/register', {
        email: testEmail,
        password: testPassword,
        full_name: 'Duplicate Alice'
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
    });
  });
}

module.exports = { registerAuthTests };
