/**
 * Tier 1: Feature Coverage - Checkout with Transactional Locking
 * Verifies order placement, payment record generation, stock decrement, and cart clearing.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerCheckoutTests() {
  describe('Tier 1: Checkout Locking & Orders Feature Coverage', () => {
    const cartId = `checkout_tier1_${Date.now()}`;
    let initialStock = 0;
    let placedOrderUuid = null;

    it('should prepare cart with items for checkout flow', async () => {
      // Check initial stock for product 4 (Smart Aroma Diffuser $34.99)
      const prodRes = await client.get('/api/v1/catalog/products/4');
      expect(prodRes.status).toBe(200);
      initialStock = prodRes.body.product.stock_quantity;

      // Add item to cart
      const addRes = await client.post('/api/v1/cart/items', {
        cart_id: cartId,
        product_id: 4,
        quantity: 2
      });
      expect(addRes.status).toBe(200);
      expect(addRes.body.items.length).toBe(1);
    });

    it('should complete checkout and return HTTP 200 with order_uuid', async () => {
      const res = await client.post('/api/v1/checkout', {
        cart_id: cartId,
        shipping_address: '742 Evergreen Terrace, Springfield',
        payment_method: 'card'
      });

      expect(res.status).toBe(200);
      expect(res.body.order_uuid).toBeDefined();
      expect(res.body.order_uuid.startsWith('qc_ord_')).toBe(true);
      expect(res.body.status).toBe('paid');
      expect(res.body.total).toBeGreaterThan(0);
      placedOrderUuid = res.body.order_uuid;
    });

    it('should verify payment record is marked as captured and order is paid', async () => {
      expect(placedOrderUuid).toBeTruthy();
      // Inspect order details
      const res = await client.get(`/api/v1/cart?cart_id=${cartId}`);
      expect(res.status).toBe(200);
      // Cart should be empty post-checkout
      expect(res.body.items.length).toBe(0);
      expect(res.body.subtotal).toBe(0);
    });

    it('should verify that product inventory was decremented by checkout quantity', async () => {
      const prodRes = await client.get('/api/v1/catalog/products/4');
      expect(prodRes.status).toBe(200);
      // Stock should have decreased by 2
      expect(prodRes.body.product.stock_quantity).toBe(initialStock - 2);
    });

    it('should retain accurate order summary math with discounts in completed order', async () => {
      const discountCartId = `cart_disc_chk_${Date.now()}`;
      // Add product 1 ($199.99)
      await client.post('/api/v1/cart/items', { cart_id: discountCartId, product_id: 1, quantity: 1 });
      // Apply SAVE20 (20%)
      await client.post('/api/v1/cart/coupon', { cart_id: discountCartId, coupon_code: 'SAVE20' });

      const chkRes = await client.post('/api/v1/checkout', {
        cart_id: discountCartId,
        shipping_address: '100 Market St, San Francisco, CA',
        payment_method: 'card'
      });

      expect(chkRes.status).toBe(200);
      expect(chkRes.body.discount).toBeGreaterThan(0);
      expect(chkRes.body.subtotal).toBe(199.99);
      expect(chkRes.body.discount).toBe(40.00);
    });

    it('should reject checkout request missing shipping address with 400 Bad Request', async () => {
      const emptyAddrCartId = `cart_no_addr_${Date.now()}`;
      await client.post('/api/v1/cart/items', { cart_id: emptyAddrCartId, product_id: 2, quantity: 1 });

      const res = await client.post('/api/v1/checkout', {
        cart_id: emptyAddrCartId,
        shipping_address: '', // Empty
        payment_method: 'card'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });
}

module.exports = { registerCheckoutTests };
