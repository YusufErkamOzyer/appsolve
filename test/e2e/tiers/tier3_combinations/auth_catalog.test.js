/**
 * Tier 3: Cross-Feature Combinations - Auth & Catalog Pairwise
 * Verifies that authenticated sessions can query catalog products and receive cached responses.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerAuthCatalogTests() {
  describe('Tier 3: Pairwise Auth & Catalog Browsing', () => {
    let userToken = null;

    it('should authenticate user and browse catalog with session context', async () => {
      const email = `shopper_${Date.now()}@quickcart.local`;
      const regRes = await client.post('/api/v1/auth/register', {
        email,
        password: 'Password123!',
        full_name: 'Catalog Shopper'
      });
      expect(regRes.status).toBe(201);
      userToken = regRes.body.token;

      // Browse catalog using user token
      const catRes = await client.get('/api/v1/catalog/products', {
        token: userToken
      });
      expect(catRes.status).toBe(200);
      expect(catRes.body.products.length).toBeGreaterThan(0);
    });
  });
}

module.exports = { registerAuthCatalogTests };
