/**
 * Tier 4: Real-World Application Scenarios - Complete Customer Journey
 * Simulates a realistic customer session: registration, multi-category browsing, search,
 * cart adjustments, coupon discount, checkout, and order receipt verification.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerCustomerJourneyTests() {
  describe('Tier 4: Real-World Customer Shopping Journey', () => {
    it('should complete a multi-step customer shopping session with cart adjustments and coupon', async () => {
      // 1. Customer registers
      const customerEmail = `customer_${Date.now()}@realworld.local`;
      const regRes = await client.post('/api/v1/auth/register', {
        email: customerEmail,
        password: 'CustomerPass2026!',
        full_name: 'Grace Hopper'
      });
      expect(regRes.status).toBe(201);
      const token = regRes.body.token;

      // 2. Customer browses Electronics category
      const elecRes = await client.get('/api/v1/catalog/products?category=Electronics', { token });
      expect(elecRes.status).toBe(200);
      expect(elecRes.body.products.length).toBeGreaterThanOrEqual(1);
      const keyboard = elecRes.body.products.find(p => p.sku === 'QC-ELEC-02') || elecRes.body.products[0];

      // 3. Customer searches for 'Hoodie'
      const searchRes = await client.get('/api/v1/catalog/products?search=Hoodie', { token });
      expect(searchRes.status).toBe(200);
      const hoodie = searchRes.body.products[0];
      expect(hoodie).toBeDefined();

      // 4. Customer adds keyboard and hoodie to cart
      const cartId = `cart_journey_${Date.now()}`;
      await client.post('/api/v1/cart/items', { cart_id: cartId, product_id: keyboard.id, quantity: 1 }, { token });
      const add2Res = await client.post('/api/v1/cart/items', { cart_id: cartId, product_id: hoodie.id, quantity: 2 }, { token });
      expect(add2Res.body.items.length).toBe(2);

      // 5. Customer adjusts hoodie quantity from 2 to 1
      const hoodieItem = add2Res.body.items.find(i => i.product_id === hoodie.id);
      const patchRes = await client.patch(`/api/v1/cart/items/${hoodieItem.id}`, {
        cart_id: cartId,
        quantity: 1
      }, { token });
      expect(patchRes.status).toBe(200);
      const updatedHoodie = patchRes.body.items.find(i => i.product_id === hoodie.id);
      expect(updatedHoodie.quantity).toBe(1);

      // 6. Customer applies promo code SAVE20
      const couponRes = await client.post('/api/v1/cart/coupon', {
        cart_id: cartId,
        coupon_code: 'SAVE20'
      }, { token });
      expect(couponRes.status).toBe(200);
      expect(couponRes.body.discount).toBeGreaterThan(0);
      const finalCartTotal = couponRes.body.total;

      // 7. Customer submits checkout
      const chkRes = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '1 Infinite Loop, Cupertino, CA 95014',
        payment_method: 'card'
      }, { token });

      expect(chkRes.status).toBe(200);
      expect(chkRes.body.status).toBe('paid');
      expect(chkRes.body.order_uuid).toBeDefined();
      expect(chkRes.body.total).toBe(finalCartTotal);

      // 8. Confirm cart is now empty
      const finalCart = await client.get(`/api/v1/cart?cart_id=${cartId}`, { token });
      expect(finalCart.body.items.length).toBe(0);
    });
  });
}

module.exports = { registerCustomerJourneyTests };
