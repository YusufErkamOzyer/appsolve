/**
 * Tier 4: Real-World Application Scenarios - Flash Sale Concurrency
 * Simulates multiple concurrent shoppers competing for inventory, verifying atomic transaction locking and zero stock drift.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerFlashSaleConcurrencyTests() {
  describe('Tier 4: Flash Sale Concurrency & Inventory Isolation', () => {
    it('should handle concurrent checkout requests with transactional integrity and prevent overselling', async () => {
      // 1. Get initial inventory of product 2 (Mechanical Gaming Keyboard)
      const prodRes = await client.get('/api/v1/catalog/products/2');
      expect(prodRes.status).toBe(200);
      const startingStock = prodRes.body.product.stock_quantity;
      expect(startingStock).toBeGreaterThanOrEqual(5);

      // 2. Prepare 5 concurrent shoppers with carts
      const numShoppers = 5;
      const carts = [];
      for (let i = 0; i < numShoppers; i++) {
        const cartId = `cart_flash_${i}_${Date.now()}`;
        await client.post('/api/cart/items', { cart_id: cartId, product_id: 2, quantity: 1 });
        carts.push(cartId);
      }

      // 3. Fire all 5 checkouts concurrently
      const checkoutPromises = carts.map((cartId, idx) =>
        client.post('/api/v1/checkout', {
          cart_id: cartId,
          shipping_address: `Shopper ${idx} Flash St`,
          payment_method: 'card'
        })
      );

      const results = await Promise.all(checkoutPromises);

      // 4. Verify all 5 checkouts succeeded with paid status
      let successfulCount = 0;
      for (const res of results) {
        if (res.status === 200 && res.body.status === 'paid') {
          successfulCount++;
        }
      }
      expect(successfulCount).toBe(numShoppers);

      // 5. Verify final inventory exactly equals startingStock - 5
      const postProdRes = await client.get('/api/v1/catalog/products/2');
      expect(postProdRes.body.product.stock_quantity).toBe(startingStock - numShoppers);
    });
  });
}

module.exports = { registerFlashSaleConcurrencyTests };
