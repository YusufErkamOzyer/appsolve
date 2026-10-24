/**
 * Tier 3: Cross-Feature Combinations - Complete End-to-End Shopping Lifecycle
 * Verifies the full pipeline: Register User -> Browse Catalog -> Add to Cart -> Apply Coupon -> Checkout -> Verify Empty Cart.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerLifecycleTests() {
  describe('Tier 3: Complete Shopping Lifecycle Flow', () => {
    it('should execute end-to-end multi-step shopping journey cleanly', async () => {
      // Step 1: User Registration
      const email = `lifecycle_user_${Date.now()}@quickcart.local`;
      const regRes = await client.post('/api/v1/auth/register', {
        email,
        password: 'LifecyclePass123!',
        full_name: 'Lifecycle Shopper'
      });
      expect(regRes.status).toBe(201);
      const userToken = regRes.body.token;

      // Step 2: Browse Catalog & Select Items
      const catRes = await client.get('/api/v1/catalog/products', { token: userToken });
      expect(catRes.status).toBe(200);
      const prod1 = catRes.body.products[0];
      const prod2 = catRes.body.products[1];

      // Step 3: Populate Cart
      const cartId = `cart_lc_${Date.now()}`;
      await client.post('/api/v1/cart/items', { cart_id: cartId, product_id: prod1.id, quantity: 1 }, { token: userToken });
      const add2Res = await client.post('/api/v1/cart/items', { cart_id: cartId, product_id: prod2.id, quantity: 1 }, { token: userToken });
      expect(add2Res.body.items.length).toBe(2);

      // Step 4: Apply Discount Coupon
      const coupRes = await client.post('/api/v1/cart/coupon', { cart_id: cartId, coupon_code: 'SAVE20' }, { token: userToken });
      expect(coupRes.status).toBe(200);
      expect(coupRes.body.applied_coupon).toBe('SAVE20');
      const expectedTotal = coupRes.body.total;

      // Step 5: Execute Checkout
      const chkRes = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '42 Wallaby Way, Sydney',
        payment_method: 'card'
      }, { token: userToken });
      expect(chkRes.status).toBe(200);
      expect(chkRes.body.order_uuid).toBeDefined();
      expect(chkRes.body.status).toBe('paid');
      expect(chkRes.body.total).toBe(expectedTotal);

      // Step 6: Verify Cart Cleared
      const postCart = await client.get(`/api/v1/cart?cart_id=${cartId}`, { token: userToken });
      expect(postCart.status).toBe(200);
      expect(postCart.body.items.length).toBe(0);
      expect(postCart.body.subtotal).toBe(0);
    });
  });
}

module.exports = { registerLifecycleTests };
