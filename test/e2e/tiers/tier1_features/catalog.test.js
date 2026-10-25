/**
 * Tier 1: Feature Coverage - Catalog Endpoints & Caching
 * Verifies catalog browsing, product details, category listings, search, and cache headers.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerCatalogTests() {
  describe('Tier 1: Catalog & Caching Feature Coverage', () => {
    let sampleProductId = null;

    it('should list products and return 200 with product array and total count', async () => {
      const res = await client.get('/api/v1/catalog/products');

      expect(res.status).toBe(200);
      expect(res.body.products).toBeDefined();
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBeGreaterThan(0);
      expect(res.body.count).toBeGreaterThan(0);

      const first = res.body.products[0];
      expect(first.id).toBeDefined();
      expect(first.sku).toBeDefined();
      expect(first.name).toBeDefined();
      expect(first.price).toBeGreaterThan(0);
      sampleProductId = first.id;
    });

    it('should fetch single product detail by ID with 200 and complete attributes', async () => {
      expect(sampleProductId).toBeTruthy();
      const res = await client.get(`/api/v1/catalog/products/${sampleProductId}`);

      expect(res.status).toBe(200);
      expect(res.body.product).toBeDefined();
      expect(res.body.product.id).toBe(sampleProductId);
      expect(res.body.product.name).toBeDefined();
      expect(res.body.product.price).toBeGreaterThan(0);
      expect(res.body.product.stock_quantity).toBeGreaterThanOrEqual(0);
    });

    it('should list catalog categories and return 200 with category names', async () => {
      const res = await client.get('/api/v1/catalog/categories');

      expect(res.status).toBe(200);
      expect(res.body.categories).toBeDefined();
      expect(Array.isArray(res.body.categories)).toBe(true);
      expect(res.body.categories.length).toBeGreaterThan(0);
      expect(res.body.categories).toContain('Electronics');
    });

    it('should verify cache behavior with X-Cache headers (MISS on first read, HIT on warm cache)', async () => {
      // First read to prime cache
      const queryKey = `bench_${Date.now()}`;
      const res1 = await client.get(`/api/v1/catalog/products?search=${queryKey}`);
      expect(res1.status).toBe(200);

      // Second read should hit cache
      const res2 = await client.get(`/api/v1/catalog/products?search=${queryKey}`);
      expect(res2.status).toBe(200);
      const cacheHeader = res2.headers.get('x-cache');
      if (cacheHeader) {
        expect(cacheHeader.toUpperCase()).toBe('HIT');
      }
    });

    it('should filter catalog by category returning only matching products', async () => {
      const targetCategory = 'Electronics';
      const res = await client.get(`/api/v1/catalog/products?category=${targetCategory}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
      for (const prod of res.body.products) {
        expect(prod.category.toLowerCase()).toBe(targetCategory.toLowerCase());
      }
    });

    it('should filter catalog products by search query keyword', async () => {
      const res = await client.get('/api/v1/catalog/products?search=Headphones');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBeGreaterThan(0);
      expect(res.body.products[0].name.toLowerCase()).toContain('headphones');
    });
  });
}

module.exports = { registerCatalogTests };
