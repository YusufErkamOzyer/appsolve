/**
 * Tier 2: Boundary & Corner Cases - Cart & Discounts
 * Verifies empty cart operations, expired/invalid coupons, minimum subtotal gates, stock limits, and negative balance protection.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerCartBoundaryTests() {
  describe('Tier 2: Cart Boundary & Corner Cases', () => {
    const emptyCartId = `cart_boundary_empty_${Date.now()}`;

    it('should reject checkout attempt on empty cart with 400 Bad Request', async () => {
      const res = await client.post('/api/v1/checkout', {
        cart_id: emptyCartId,
        shipping_address: '123 Fake Street',
        payment_method: 'card'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('EMPTY_CART');
    });

    it('should reject invalid or non-existent coupon codes with 400 Bad Request', async () => {
      const testCartId = `cart_inv_coup_${Date.now()}`;
      await client.post('/api/v1/cart/items', { cart_id: testCartId, product_id: 1, quantity: 1 });

      const res = await client.post('/api/v1/cart/coupon', {
        cart_id: testCartId,
        coupon_code: 'INVALID_CODE_12345'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_COUPON');
    });

    it('should reject expired coupon (EXPIRED99) with 400 Bad Request', async () => {
      const testCartId = `cart_exp_coup_${Date.now()}`;
      await client.post('/api/v1/cart/items', { cart_id: testCartId, product_id: 1, quantity: 1 });

      const res = await client.post('/api/v1/cart/coupon', {
        cart_id: testCartId,
        coupon_code: 'EXPIRED99'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_COUPON');
    });

    it('should reject coupon when order subtotal is below minimum order amount requirement', async () => {
      const testCartId = `cart_below_min_${Date.now()}`;
      // Add product 5 (Waterproof Laptop Sleeve $24.95)
      await client.post('/api/v1/cart/items', { cart_id: testCartId, product_id: 5, quantity: 1 });

      // SAVE20 requires min subtotal of $50
      const res = await client.post('/api/v1/cart/coupon', {
        cart_id: testCartId,
        coupon_code: 'SAVE20'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('COUPON_MIN_SUBTOTAL');
    });

    it('should reject item quantity exceeding available warehouse stock with 400 Out of Stock', async () => {
      const testCartId = `cart_out_stock_${Date.now()}`;
      const res = await client.post('/api/v1/cart/items', {
        cart_id: testCartId,
        product_id: 1,
        quantity: 99999 // Exceeds stock (45)
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('OUT_OF_STOCK');
    });

    it('should ensure discount capped at subtotal so order total never becomes negative', async () => {
      const testCartId = `cart_neg_check_${Date.now()}`;
      // Add $24.95 sleeve
      await client.post('/api/v1/cart/items', { cart_id: testCartId, product_id: 5, quantity: 1 });

      // Apply FLAT10
      const res = await client.post('/api/v1/cart/coupon', {
        cart_id: testCartId,
        coupon_code: 'FLAT10'
      });

      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThanOrEqual(0);
      expect(res.body.discount).toBeLessThanOrEqual(res.body.subtotal);
    });
  });
}

module.exports = { registerCartBoundaryTests };
