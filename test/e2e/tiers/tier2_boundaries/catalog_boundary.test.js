/**
 * Tier 2: Boundary & Corner Cases - Catalog
 * Verifies 404 responses, empty category results, extreme pagination limits, and regex meta-characters.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerCatalogBoundaryTests() {
  describe('Tier 2: Catalog Boundary & Corner Cases', () => {

    it('should return 404 Not Found when requesting non-existent product ID 999999', async () => {
      const res = await client.get('/api/v1/catalog/products/999999');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('should return empty product list (not 500) when querying non-existent category', async () => {
      const res = await client.get('/api/v1/catalog/products?category=NonExistentCategoryXYZ');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBe(0);
      expect(res.body.count).toBe(0);
    });

    it('should handle extreme pagination parameters (negative offset, zero limit) gracefully', async () => {
      const res = await client.get('/api/v1/catalog/products?offset=-10&limit=0');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
    });

    it('should handle adversarial search queries containing regex meta-characters (!@#$%^&*()_+{}|:<>?) safely', async () => {
      const specialQuery = '!@#$%^&*()_+{}[];:?><.,/|\\';
      const encoded = encodeURIComponent(specialQuery);
      const res = await client.get(`/api/v1/catalog/products?search=${encoded}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
    });

    it('should handle cache query strings with excessive whitespace and duplicate keys without collision', async () => {
      const res1 = await client.get('/api/v1/catalog/products?search=%20%20%20');
      expect(res1.status).toBe(200);

      const res2 = await client.get('/api/v1/catalog/products?category=Electronics&category=Apparel');
      expect(res2.status).toBe(200);
      expect(Array.isArray(res2.body.products)).toBe(true);
    });
  });
}

module.exports = { registerCatalogBoundaryTests };
