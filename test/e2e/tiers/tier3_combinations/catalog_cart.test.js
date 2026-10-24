/**
 * Tier 3: Cross-Feature Combinations - Catalog & Cart Pairwise
 * Verifies selecting products from catalog and adding them to shopping cart with accurate pricing.
 */

const { describe, it, expect } = require('../../lib/harness');
const { client } = require('../../lib/client');

function registerCatalogCartTests() {
  describe('Tier 3: Pairwise Catalog Discovery to Cart Addition', () => {
    it('should select product from catalog and verify cart prices match catalog prices', async () => {
      // 1. Fetch catalog
      const catRes = await client.get('/api/v1/catalog/products');
      expect(catRes.status).toBe(200);
      const selected = catRes.body.products[0];

      // 2. Add to cart
      const cartId = `cart_cat_pair_${Date.now()}`;
      const addRes = await client.post('/api/v1/cart/items', {
        cart_id: cartId,
        product_id: selected.id,
        quantity: 2
      });

      expect(addRes.status).toBe(200);
      const cartItem = addRes.body.items[0];
      expect(cartItem.product_id).toBe(selected.id);
      expect(cartItem.price).toBe(selected.price);
      expect(cartItem.item_total).toBe(parseFloat((selected.price * 2).toFixed(2)));
      expect(addRes.body.subtotal).toBe(cartItem.item_total);
    });
  });
}

module.exports = { registerCatalogCartTests };
