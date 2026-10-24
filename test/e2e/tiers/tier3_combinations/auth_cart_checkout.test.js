/**
 * Tier 3: Cross-Feature Combinations - Auth + Cart + Checkout
 * Verifies authenticated customer creating a cart and executing a bound checkout.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerAuthCartCheckoutTests() {
  describe('Tier 3: Authenticated Customer Cart and Checkout Binding', () => {
    it('should complete authenticated customer shopping and order placement', async () => {
      const email = `auth_shopper_${Date.now()}@quickcart.local`;
      const authRes = await client.post('/api/v1/auth/register', {
        email,
        password: 'SecurePassword123!',
        full_name: 'Auth Customer'
      });
      expect(authRes.status).toBe(201);
      const token = authRes.body.token;

      const cartId = `user_cart_${authRes.body.user.id}_${Date.now()}`;
      await client.post('/api/v1/cart/items', {
        cart_id: cartId,
        product_id: 2,
        quantity: 1
      }, { token });

      const chkRes = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '10 Downing St',
        payment_method: 'card'
      }, { token });

      expect(chkRes.status).toBe(200);
      expect(chkRes.body.order_uuid).toBeDefined();
      expect(chkRes.body.status).toBe('paid');
    });
  });
}

module.exports = { registerAuthCartCheckoutTests };
