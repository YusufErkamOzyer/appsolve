/**
 * Tier 2: Boundary & Corner Cases - Checkout & Deadlock Contention
 * Verifies negative inputs, active deadlock 504 timeouts, whitespace validation, and double-checkout idempotency.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerCheckoutBoundaryTests() {
  describe('Tier 2: Checkout Boundary & Corner Cases', () => {

    it('should reject adding item with negative or zero quantity with 400 Bad Request', async () => {
      const cartId = `cart_neg_qty_${Date.now()}`;
      const res = await client.post('/api/v1/cart/items', {
        cart_id: cartId,
        product_id: 1,
        quantity: -5
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_QUANTITY');
    });

    it('should return HTTP 504 Gateway Timeout when checkout encounters active database deadlock', async () => {
      // Inject database deadlock chaos
      await client.post('/api/chaos/lock-checkout', {});

      const cartId = `cart_deadlock_${Date.now()}`;
      await client.post('/api/cart/items', { cart_id: cartId, product_id: 1, quantity: 1 });

      const res = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '100 Mission St, San Francisco, CA',
        payment_method: 'card'
      });

      expect(res.status).toBe(504);
      expect(res.body.error).toBe('DB_LOCK_TIMEOUT');
      expect(res.body.telemetry_forwarded).toBe(true);

      // Release deadlock via bridge to clean up
      await client.bridgeExec('kill_db_locks');
    });

    it('should reject checkout with whitespace-only shipping address with 400 Bad Request', async () => {
      const cartId = `cart_white_addr_${Date.now()}`;
      await client.post('/api/cart/items', { cart_id: cartId, product_id: 1, quantity: 1 });

      const res = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '     \t\n   ', // Whitespace only
        payment_method: 'card'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MISSING_SHIPPING_ADDRESS');
    });

    it('should reject second checkout submission on already cleared cart with 400 Bad Request', async () => {
      const cartId = `cart_double_chk_${Date.now()}`;
      await client.post('/api/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });

      // First checkout: succeeds
      const firstRes = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '456 Elm St',
        payment_method: 'card'
      });
      expect(firstRes.status).toBe(200);

      // Immediate second checkout: cart is empty, must fail
      const secondRes = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '456 Elm St',
        payment_method: 'card'
      });
      expect(secondRes.status).toBe(400);
      expect(secondRes.body.error).toBe('EMPTY_CART');
    });

    it('should maintain stock integrity across concurrent checkout requests without overselling', async () => {
      // Find current stock of product 5
      const prodRes = await client.get('/api/v1/catalog/products/5');
      const currentStock = prodRes.body.product.stock_quantity;

      const cart1 = `cart_conc_1_${Date.now()}`;
      const cart2 = `cart_conc_2_${Date.now()}`;

      await client.post('/api/cart/items', { cart_id: cart1, product_id: 5, quantity: 1 });
      await client.post('/api/cart/items', { cart_id: cart2, product_id: 5, quantity: 1 });

      // Execute both checkouts concurrently
      const [res1, res2] = await Promise.all([
        client.post('/api/v1/checkout', { cart_id: cart1, shipping_address: 'Address 1', payment_method: 'card' }),
        client.post('/api/v1/checkout', { cart_id: cart2, shipping_address: 'Address 2', payment_method: 'card' })
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify stock decreased by exactly 2
      const postProdRes = await client.get('/api/v1/catalog/products/5');
      expect(postProdRes.body.product.stock_quantity).toBe(currentStock - 2);
    });
  });
}

module.exports = { registerCheckoutBoundaryTests };
