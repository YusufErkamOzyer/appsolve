/**
 * Tier 3: Cross-Feature Combinations - Cart with Coupon to Checkout
 * Verifies that applied coupon discount propagates accurately into final checkout total.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerCartCouponCheckoutTests() {
  describe('Tier 3: Cart with Coupon into Checkout Transaction', () => {
    it('should calculate coupon discount in cart and persist the exact discounted total at checkout', async () => {
      const cartId = `cart_disc_chk_${Date.now()}`;

      // Add two different products
      await client.post('/api/v1/cart/items', { cart_id: cartId, product_id: 1, quantity: 1 }); // $199.99
      await client.post('/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 }); // $59.00

      // Apply SAVE20
      const couponRes = await client.post('/api/v1/cart/coupon', {
        cart_id: cartId,
        coupon_code: 'SAVE20'
      });
      expect(couponRes.status).toBe(200);
      const cartTotal = couponRes.body.total;
      const cartDiscount = couponRes.body.discount;

      // Checkout
      const chkRes = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '500 Howard St, San Francisco, CA',
        payment_method: 'card'
      });

      expect(chkRes.status).toBe(200);
      expect(chkRes.body.discount).toBe(cartDiscount);
      expect(chkRes.body.total).toBe(cartTotal);
      expect(chkRes.body.status).toBe('paid');
    });
  });
}

module.exports = { registerCartCouponCheckoutTests };
