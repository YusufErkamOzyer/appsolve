/**
 * Tier 1: Feature Coverage - Cart & Coupon Discount Calculation
 * Verifies cart persistence, item manipulation, discount math, and subtotal/tax/total calculations.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerCartTests() {
  describe('Tier 1: Cart & Coupon Discounts Feature Coverage', () => {
    const cartId = `cart_tier1_${Date.now()}`;
    let addedItemId = null;

    it('should retrieve cart state via GET /api/v1/cart with valid structure', async () => {
      const res = await client.get(`/api/v1/cart?cart_id=${cartId}`);

      expect(res.status).toBe(200);
      expect(res.body.id || res.body.cart_id).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.subtotal).toBe(0);
      expect(res.body.total).toBe(0);
    });

    it('should add an item to the cart and update subtotal and total', async () => {
      const res = await client.post('/api/v1/cart/items', {
        cart_id: cartId,
        product_id: 1, // Headphones $199.99
        quantity: 1
      });

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].product_id).toBe(1);
      expect(res.body.items[0].quantity).toBe(1);
      expect(res.body.subtotal).toBeGreaterThan(0);
      expect(res.body.total).toBeGreaterThan(0);
      addedItemId = res.body.items[0].id;
    });

    it('should update cart item quantity via PATCH /api/v1/cart/items/:id', async () => {
      expect(addedItemId).toBeTruthy();
      const res = await client.patch(`/api/v1/cart/items/${addedItemId}`, {
        cart_id: cartId,
        quantity: 2
      });

      expect(res.status).toBe(200);
      const item = res.body.items.find(i => i.id === addedItemId);
      expect(item).toBeDefined();
      expect(item.quantity).toBe(2);
      expect(item.item_total).toBe(parseFloat((item.price * 2).toFixed(2)));
    });

    it('should apply a percentage coupon and compute discount accurately', async () => {
      // SAVE20 gives 20% discount on order
      const res = await client.post('/api/v1/cart/coupon', {
        cart_id: cartId,
        coupon_code: 'SAVE20'
      });

      expect(res.status).toBe(200);
      expect(res.body.applied_coupon).toBe('SAVE20');
      expect(res.body.discount).toBeGreaterThan(0);

      // Verify discount formula: subtotal * 0.20
      const expectedDiscount = parseFloat((res.body.subtotal * 0.20).toFixed(2));
      expect(res.body.discount).toBe(expectedDiscount);

      // Verify total math: (subtotal - discount) + tax
      const expectedTax = parseFloat(((res.body.subtotal - res.body.discount) * 0.08).toFixed(2));
      expect(res.body.tax).toBe(expectedTax);
      expect(res.body.total).toBe(parseFloat(((res.body.subtotal - res.body.discount) + expectedTax).toFixed(2)));
    });

    it('should remove an item from the cart via DELETE /api/v1/cart/items/:id', async () => {
      expect(addedItemId).toBeTruthy();
      const res = await client.delete(`/api/v1/cart/items/${addedItemId}?cart_id=${cartId}`);

      expect(res.status).toBe(200);
      const remaining = res.body.items.find(i => i.id === addedItemId);
      expect(remaining).toBeUndefined();
      expect(res.body.subtotal).toBe(0);
    });

    it('should apply a fixed dollar coupon and compute discount correctly', async () => {
      const fixedCartId = `cart_fixed_${Date.now()}`;
      // Add $59 hoodie
      await client.post('/api/v1/cart/items', { cart_id: fixedCartId, product_id: 3, quantity: 1 });

      // Apply FLAT10 ($10 fixed discount)
      const res = await client.post('/api/v1/cart/coupon', {
        cart_id: fixedCartId,
        coupon_code: 'FLAT10'
      });

      expect(res.status).toBe(200);
      expect(res.body.applied_coupon).toBe('FLAT10');
      expect(res.body.discount).toBe(10);
      expect(res.body.subtotal).toBe(59);
    });
  });
}

module.exports = { registerCartTests };
