#!/usr/bin/env node
/**
 * Empirical Adversarial Challenger Verification Suite
 * Milestone 1 Iteration 2 Gate (QuickCart Backend & SRE Bridge)
 * 
 * Tests the 4 core remediations and stress/security vectors:
 * 1. Cart item quantity update (setting quantity, quantity <= 0 deletion, stock boundary)
 * 2. Coupon recalculation upon quantity changes (upward, downward revocation, empty cart)
 * 3. Catalog cache invalidation upon checkout order completion
 * 4. Whitespace and empty shipping address rejection (400 MISSING_SHIPPING_ADDRESS)
 * 5. Adversarial stress & boundary probing (concurrency, SQLi, payload injection)
 */

const BASE_URL = process.env.QUICKCART_URL || 'http://localhost:4000';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  \x1b[31m✖\x1b[0m ${name}`);
    console.error(`    \x1b[33mError: ${err.message}\x1b[0m`);
    failures.push({ name, error: err.message, stack: err.stack });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'} - Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`);
  }
}

async function request(method, path, body = null, headers = {}) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json, headers: res.headers };
}

async function runAll() {
  console.log('\n======================================================================');
  console.log('  CHALLENGER 1: EMPIRICAL ADVERSARIAL VERIFICATION SUITE');
  console.log(`  Target: ${BASE_URL}`);
  console.log('======================================================================\n');

  // Verify server is alive and clean any residual locks
  const health = await request('GET', '/health');
  if (health.status !== 200) {
    console.error(`FATAL: Backend not healthy at ${BASE_URL} (status ${health.status})`);
    process.exit(1);
  }
  // Release any residual locks from prior chaos injections
  await request('POST', '/api/chaos/reset');
  await request('POST', '/api/bridge/v1/exec', { command: 'kill_db_locks' }, {
    'Authorization': 'Bearer quickcart-sre-secret-token'
  });

  // Helper to extract product from GET /api/v1/catalog/products/:id
  const getProduct = async (id) => {
    const res = await request('GET', `/api/v1/catalog/products/${id}`);
    const prod = res.body.product || res.body;
    return { ...res, product: prod, stock_quantity: prod.stock_quantity };
  };

  // -------------------------------------------------------------------
  // SUITE 1: Cart Item Quantity Update
  // -------------------------------------------------------------------
  console.log('\x1b[1m\x1b[36m--- Suite 1: Cart Item Quantity Update ---\x1b[0m');

  await test('1.1 PATCH /api/v1/cart/items/:id sets quantity directly (not an increment)', async () => {
    const cartId = `challenger_cart_qty_set_${Date.now()}`;
    // Add 1x Product 3 ($59.00)
    const addRes = await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 3,
      quantity: 1
    });
    assertEqual(addRes.status, 200, 'Add item status');
    assertEqual(addRes.body.items[0].quantity, 1, 'Initial quantity');
    const itemId = addRes.body.items[0].id;

    // PATCH quantity to 4. If buggy (+), it would be 1 + 4 = 5. Correct = 4.
    const patchRes = await request('PATCH', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: 4
    });
    assertEqual(patchRes.status, 200, 'PATCH item status');
    assertEqual(patchRes.body.items.length, 1, 'Item count');
    assertEqual(patchRes.body.items[0].quantity, 4, 'Quantity must be exactly 4');
    assertEqual(patchRes.body.subtotal, 236.00, 'Subtotal 4 * 59.00');

    // PATCH again to 2. If buggy (+), it would be 4 + 2 = 6. Correct = 2.
    const patchRes2 = await request('PATCH', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: 2
    });
    assertEqual(patchRes2.status, 200, 'PATCH item status 2');
    assertEqual(patchRes2.body.items[0].quantity, 2, 'Quantity must be set to 2');
    assertEqual(patchRes2.body.subtotal, 118.00, 'Subtotal 2 * 59.00');
  });

  await test('1.2 PUT /api/v1/cart/items/:id also sets quantity directly', async () => {
    const cartId = `challenger_cart_put_${Date.now()}`;
    const addRes = await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 4, // $34.99
      quantity: 1
    });
    const itemId = addRes.body.items[0].id;

    const putRes = await request('PUT', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: 3
    });
    assertEqual(putRes.status, 200, 'PUT item status');
    assertEqual(putRes.body.items[0].quantity, 3, 'Quantity must be set to 3');
    assertEqual(putRes.body.subtotal, 104.97, 'Subtotal 3 * 34.99');
  });

  await test('1.3 Boundary: Update quantity to exact stock quantity succeeds (200 OK)', async () => {
    const prodRes = await getProduct(5);
    const availableStock = prodRes.stock_quantity;
    assert(availableStock > 0, 'Product 5 must have stock');

    const cartId = `challenger_cart_stock_exact_${Date.now()}`;
    const addRes = await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 5,
      quantity: 1
    });
    const itemId = addRes.body.items[0].id;

    // Set to availableStock
    const patchRes = await request('PATCH', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: availableStock
    });
    assertEqual(patchRes.status, 200, 'Set to exact stock must succeed');
    assertEqual(patchRes.body.items[0].quantity, availableStock, 'Quantity equals exact stock');
  });

  await test('1.4 Boundary: Update quantity exceeding stock quantity fails with 400 OUT_OF_STOCK', async () => {
    const prodRes = await getProduct(5);
    const availableStock = prodRes.stock_quantity;

    const cartId = `challenger_cart_stock_overflow_${Date.now()}`;
    const addRes = await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 5,
      quantity: 1
    });
    const itemId = addRes.body.items[0].id;

    // Set to availableStock + 1
    const patchRes = await request('PATCH', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: availableStock + 1
    });
    assertEqual(patchRes.status, 400, 'Exceeding stock must return 400');
    assertEqual(patchRes.body.error, 'OUT_OF_STOCK', 'Error code must be OUT_OF_STOCK');
  });

  await test('1.5 Quantity <= 0 deletion: Setting quantity to 0 deletes item from cart', async () => {
    const cartId = `challenger_cart_zero_${Date.now()}`;
    const addRes = await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 3,
      quantity: 2
    });
    const itemId = addRes.body.items[0].id;

    const patchRes = await request('PATCH', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: 0
    });
    assertEqual(patchRes.status, 200, 'Quantity 0 status');
    assertEqual(patchRes.body.items.length, 0, 'Cart must have 0 items after setting quantity to 0');
    assertEqual(patchRes.body.subtotal, 0, 'Subtotal must be 0');
    assertEqual(patchRes.body.total, 0, 'Total must be 0');
  });

  await test('1.6 Quantity <= 0 deletion: Setting negative quantity deletes item from cart', async () => {
    const cartId = `challenger_cart_neg_${Date.now()}`;
    const addRes = await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 3,
      quantity: 2
    });
    const itemId = addRes.body.items[0].id;

    const patchRes = await request('PATCH', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: -5
    });
    assertEqual(patchRes.status, 200, 'Negative quantity status');
    assertEqual(patchRes.body.items.length, 0, 'Cart must have 0 items after negative quantity');
    assertEqual(patchRes.body.subtotal, 0, 'Subtotal must be 0');
    assertEqual(patchRes.body.total, 0, 'Total must be 0');
  });

  await test('1.7 Fallback lookup: Updating item by product_id works', async () => {
    const cartId = `challenger_cart_prod_id_lookup_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 6,
      quantity: 1
    });

    // Update using product_id 6 in path
    const patchRes = await request('PATCH', `/api/v1/cart/items/6`, {
      cart_id: cartId,
      quantity: 3
    });
    assertEqual(patchRes.status, 200, 'Update by product_id status');
    assertEqual(patchRes.body.items[0].quantity, 3, 'Quantity updated via product_id');
  });

  await test('1.8 Non-existent item ID returns 404 ITEM_NOT_FOUND', async () => {
    const cartId = `challenger_cart_not_found_${Date.now()}`;
    await request('GET', `/api/v1/cart?cart_id=${cartId}`);

    const patchRes = await request('PATCH', `/api/v1/cart/items/999999`, {
      cart_id: cartId,
      quantity: 2
    });
    assertEqual(patchRes.status, 404, 'Non-existent item status');
    assertEqual(patchRes.body.error, 'ITEM_NOT_FOUND', 'Error code must be ITEM_NOT_FOUND');
  });

  await test('1.9 Multi-item cart isolation: Updating item A leaves item B unchanged', async () => {
    const cartId = `challenger_cart_multi_isolation_${Date.now()}`;
    const resA = await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 2 });
    const resB = await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 4, quantity: 3 });

    const itemA = resB.body.items.find(i => i.product_id === 3);
    const itemB = resB.body.items.find(i => i.product_id === 4);

    const patchRes = await request('PATCH', `/api/v1/cart/items/${itemA.id}`, {
      cart_id: cartId,
      quantity: 5
    });
    assertEqual(patchRes.status, 200, 'Update item A status');
    const updatedA = patchRes.body.items.find(i => i.product_id === 3);
    const updatedB = patchRes.body.items.find(i => i.product_id === 4);

    assertEqual(updatedA.quantity, 5, 'Item A quantity must be 5');
    assertEqual(updatedB.quantity, 3, 'Item B quantity must remain 3');
  });


  // -------------------------------------------------------------------
  // SUITE 2: Coupon Recalculation Upon Quantity Changes
  // -------------------------------------------------------------------
  console.log('\n\x1b[1m\x1b[36m--- Suite 2: Coupon Recalculation Upon Quantity Changes ---\x1b[0m');

  await test('2.1 Upward recalculation: Percentage coupon scales up when quantity increases', async () => {
    const cartId = `challenger_coupon_up_${Date.now()}`;
    // Product 3 = $59.00
    const addRes = await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 3,
      quantity: 1
    });
    const itemId = addRes.body.items[0].id;

    // Apply SAVE20 (20% off, min $50)
    const couponRes = await request('POST', '/api/v1/cart/apply-coupon', {
      cart_id: cartId,
      coupon_code: 'SAVE20'
    });
    assertEqual(couponRes.status, 200, 'Apply coupon status');
    assertEqual(couponRes.body.applied_coupon, 'SAVE20', 'Applied coupon code');
    assertEqual(couponRes.body.discount, 11.80, 'Initial discount (20% of 59.00)');

    // Increase quantity from 1 to 2 -> Subtotal = $118.00
    const patchRes = await request('PATCH', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: 2
    });
    assertEqual(patchRes.status, 200, 'PATCH quantity status');
    assertEqual(patchRes.body.subtotal, 118.00, 'New subtotal');
    assertEqual(patchRes.body.applied_coupon, 'SAVE20', 'Coupon remains applied');
    // Discount must be recalculated to 20% of 118.00 = 23.60
    assertEqual(patchRes.body.discount, 23.60, 'Discount must scale up to 23.60');
    // Total = (118.00 - 23.60) * 1.08 = 94.40 * 1.08 = 101.95
    assertEqual(patchRes.body.total, 101.95, 'Total after discount and 8% tax');
  });

  await test('2.2 Downward revocation: Coupon revoked when quantity reduction breaches min_order_amount', async () => {
    const cartId = `challenger_coupon_down_revoke_${Date.now()}`;
    // Product 4 = $34.99. Add 2 units -> Subtotal = $69.98 (> $50 min for SAVE20)
    const addRes = await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 4,
      quantity: 2
    });
    const itemId = addRes.body.items[0].id;

    // Apply SAVE20 (min $50)
    const couponRes = await request('POST', '/api/v1/cart/apply-coupon', {
      cart_id: cartId,
      coupon_code: 'SAVE20'
    });
    assertEqual(couponRes.status, 200, 'Apply coupon status');
    assertEqual(couponRes.body.applied_coupon, 'SAVE20', 'Coupon applied');
    assertEqual(couponRes.body.discount, 14.00, '20% of 69.98 is 14.00');

    // Reduce quantity of Product 4 from 2 to 1 -> Subtotal becomes $34.99 (< $50 threshold!)
    const patchRes = await request('PATCH', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: 1
    });
    assertEqual(patchRes.status, 200, 'PATCH quantity status');
    assertEqual(patchRes.body.subtotal, 34.99, 'New subtotal $34.99');
    // Coupon MUST be revoked!
    assertEqual(patchRes.body.applied_coupon, null, 'Coupon must be revoked when subtotal < min_order');
    assertEqual(patchRes.body.discount, 0, 'Discount must reset to 0');
    // Total = 34.99 + (34.99 * 0.08 = 2.80) = 37.79
    assertEqual(patchRes.body.total, 37.79, 'Total with no discount');
  });

  await test('2.3 Quantity 0 deletion revokes coupon and resets discount to 0', async () => {
    const cartId = `challenger_coupon_zero_del_${Date.now()}`;
    const addRes = await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 1, // $199.99
      quantity: 1
    });
    const itemId = addRes.body.items[0].id;

    await request('POST', '/api/v1/cart/apply-coupon', {
      cart_id: cartId,
      coupon_code: 'SAVE20'
    });

    // Set quantity to 0 (deletes item)
    const patchRes = await request('PATCH', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: 0
    });
    assertEqual(patchRes.status, 200, 'PATCH zero status');
    assertEqual(patchRes.body.items.length, 0, 'Cart is empty');
    assertEqual(patchRes.body.applied_coupon, null, 'Coupon revoked');
    assertEqual(patchRes.body.discount, 0, 'Discount 0');
    assertEqual(patchRes.body.total, 0, 'Total 0');
  });

  await test('2.4 Fixed discount coupon (FLAT10) behavior across quantity adjustments', async () => {
    const cartId = `challenger_coupon_flat_${Date.now()}`;
    // Product 5 = $24.95. FLAT10 requires min $20.
    const addRes = await request('POST', '/api/v1/cart/items', {
      cart_id: cartId,
      product_id: 5,
      quantity: 1
    });
    const itemId = addRes.body.items[0].id;

    const couponRes = await request('POST', '/api/v1/cart/apply-coupon', {
      cart_id: cartId,
      coupon_code: 'FLAT10'
    });
    assertEqual(couponRes.body.discount, 10.00, 'Fixed $10 discount');

    // Increase quantity to 2 ($49.90). Discount stays fixed $10.00.
    const patchRes = await request('PATCH', `/api/v1/cart/items/${itemId}`, {
      cart_id: cartId,
      quantity: 2
    });
    assertEqual(patchRes.body.subtotal, 49.90, 'Subtotal 2 * 24.95');
    assertEqual(patchRes.body.discount, 10.00, 'Fixed discount remains 10.00');
    // Taxable = 49.90 - 10.00 = 39.90. Tax = 3.19. Total = 43.09.
    assertEqual(patchRes.body.total, 43.09, 'Total computation');
  });


  // -------------------------------------------------------------------
  // SUITE 3: Catalog Cache Invalidation Upon Checkout Order Completion
  // -------------------------------------------------------------------
  console.log('\n\x1b[1m\x1b[36m--- Suite 3: Catalog Cache Invalidation Upon Checkout Order Completion ---\x1b[0m');

  await test('3.1 Single-product checkout cache invalidation', async () => {
    const productId = 3; // Organic Cotton Hoodie

    // 1. Prime cache for product 3
    const primeRes1 = await getProduct(productId);
    assertEqual(primeRes1.status, 200, 'Prime product status');
    const initialStock = primeRes1.stock_quantity;
    assert(initialStock >= 2, 'Initial stock must be >= 2');

    // 2. Prime cache for listing
    const primeListing1 = await request('GET', '/api/v1/catalog/products');
    assertEqual(primeListing1.status, 200, 'Prime listing status');
    // Fetch listing again to verify cache hit
    const primeListing2 = await request('GET', '/api/v1/catalog/products');
    assertEqual(primeListing2.body.cached, true, 'Listing must be cached');

    // 3. Purchase 2 units through checkout
    const cartId = `challenger_cache_cart_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: productId, quantity: 2 });
    const checkoutRes = await request('POST', '/api/v1/checkout', {
      cart_id: cartId,
      shipping_address: '100 Cache Invalidation Blvd, Suite 400',
      payment_method: 'card'
    });
    assertEqual(checkoutRes.status, 200, 'Checkout status');
    assertEqual(checkoutRes.body.status, 'paid', 'Order status');
    assertEqual(checkoutRes.body.payment_status, 'captured', 'Payment status');

    // 4. Immediately fetch product by ID -> MUST return decremented stock (initialStock - 2)
    const postProductRes = await getProduct(productId);
    assertEqual(postProductRes.status, 200, 'Post-checkout product status');
    assertEqual(
      postProductRes.stock_quantity,
      initialStock - 2,
      `Product cache must be invalidated and reflect fresh stock: ${initialStock - 2}`
    );

    // 5. Immediately fetch product listing -> Cache MUST have been evicted (cached: false) and show updated stock
    const postListingRes = await request('GET', '/api/v1/catalog/products');
    assertEqual(postListingRes.status, 200, 'Post-checkout listing status');
    assertEqual(postListingRes.body.cached, false, 'Listing cache must be evicted (cached: false)');
    const listedProduct = postListingRes.body.products.find(p => p.id === productId);
    assert(listedProduct !== undefined, 'Product must exist in listing');
    assertEqual(listedProduct.stock_quantity, initialStock - 2, 'Listing must reflect decremented stock');
  });

  await test('3.2 Multi-product checkout invalidates cache for all affected products', async () => {
    const prodAId = 4;
    const prodBId = 5;

    // 1. Prime cache for both products
    const resA = await getProduct(prodAId);
    const resB = await getProduct(prodBId);
    const stockA = resA.stock_quantity;
    const stockB = resB.stock_quantity;

    // 2. Buy 1 unit of A and 2 units of B
    const cartId = `challenger_multi_cache_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: prodAId, quantity: 1 });
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: prodBId, quantity: 2 });

    const checkoutRes = await request('POST', '/api/v1/checkout', {
      cart_id: cartId,
      shipping_address: '200 Multi Invalidation Way',
      payment_method: 'card'
    });
    assertEqual(checkoutRes.status, 200, 'Multi checkout status');

    // 3. Verify both caches evicted and stocks decremented
    const postA = await getProduct(prodAId);
    const postB = await getProduct(prodBId);

    assertEqual(postA.stock_quantity, stockA - 1, 'Product A stock decremented');
    assertEqual(postB.stock_quantity, stockB - 2, 'Product B stock decremented');
  });

  await test('3.3 Failed checkout does not evict cache or alter inventory', async () => {
    const productId = 6;
    const initialRes = await getProduct(productId);
    const initialStock = initialRes.stock_quantity;

    const cartId = `challenger_fail_cache_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: productId, quantity: 1 });

    // Attempt checkout with empty shipping address (should fail 400)
    const failCheckout = await request('POST', '/api/v1/checkout', {
      cart_id: cartId,
      shipping_address: '   '
    });
    assertEqual(failCheckout.status, 400, 'Checkout rejection');

    // Verify stock is untouched
    const checkRes = await getProduct(productId);
    assertEqual(checkRes.stock_quantity, initialStock, 'Stock remains unchanged after failed checkout');
  });


  // -------------------------------------------------------------------
  // SUITE 4: Whitespace and Empty Shipping Address Rejection
  // -------------------------------------------------------------------
  console.log('\n\x1b[1m\x1b[36m--- Suite 4: Whitespace and Empty Shipping Address Rejection ---\x1b[0m');

  const testRejection = async (scenario, addressValue, expectedCode = 'MISSING_SHIPPING_ADDRESS') => {
    const cartId = `challenger_addr_${Date.now()}_${Math.random()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });

    const payload = { cart_id: cartId };
    if (addressValue !== undefined) {
      payload.shipping_address = addressValue;
    }

    const res = await request('POST', '/api/v1/checkout', payload);
    assertEqual(res.status, 400, `${scenario}: Status must be 400`);
    assertEqual(res.body.error, expectedCode, `${scenario}: Error must be ${expectedCode}`);
    assertEqual(res.body.telemetry_forwarded, undefined, `${scenario}: 4xx must not forward telemetry`);

    // Verify cart was not cleared
    const cartCheck = await request('GET', `/api/v1/cart?cart_id=${cartId}`);
    assertEqual(cartCheck.body.items.length, 1, `${scenario}: Cart items preserved`);
  };

  await test('4.1 Rejects empty string shipping_address: ""', () => testRejection('Empty string', ''));
  await test('4.2 Rejects spaces-only shipping_address: "    "', () => testRejection('Spaces only', '    '));
  await test('4.3 Rejects tab and newline whitespace: "\\t\\n\\r  "', () => testRejection('Tabs & newlines', '\t\n\r  '));
  await test('4.4 Rejects missing shipping_address (undefined)', () => testRejection('Omitted', undefined));
  await test('4.5 Rejects null shipping_address', () => testRejection('Null value', null));
  await test('4.6 Rejects non-string number: 12345', () => testRejection('Number', 12345));
  await test('4.7 Rejects non-string object: {}', () => testRejection('Object', {}));
  await test('4.8 Rejects non-string array: []', () => testRejection('Array', []));

  await test('4.9 Valid shipping address with leading/trailing spaces is trimmed and accepted (200 OK)', async () => {
    const cartId = `challenger_addr_trim_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });

    const res = await request('POST', '/api/v1/checkout', {
      cart_id: cartId,
      shipping_address: '   742 Evergreen Terrace, Springfield, OR 97477   '
    });
    assertEqual(res.status, 200, 'Valid trimmed address status');
    assertEqual(res.body.status, 'paid', 'Order status paid');
    assertEqual(res.body.shipping_address, '742 Evergreen Terrace, Springfield, OR 97477', 'Address trimmed');
    assertEqual(res.body.payment_status, 'captured', 'Payment captured');
    assert(res.body.order_uuid.startsWith('qc_ord_'), 'Valid order UUID prefix');
  });


  // -------------------------------------------------------------------
  // SUITE 5: Adversarial Stress & Security Probing
  // -------------------------------------------------------------------
  console.log('\n\x1b[1m\x1b[36m--- Suite 5: Adversarial Stress & Security Probing ---\x1b[0m');

  await test('5.1 Rapid oscillating quantity updates preserve mathematical integrity', async () => {
    const cartId = `challenger_oscillate_${Date.now()}`;
    const addRes = await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });
    const itemId = addRes.body.items[0].id;

    // Apply SAVE20
    await request('POST', '/api/v1/cart/apply-coupon', { cart_id: cartId, coupon_code: 'SAVE20' });

    // Cycle through: 5 -> 2 -> 10 -> 1 -> 3
    const sequence = [5, 2, 10, 1, 3];
    for (const q of sequence) {
      const res = await request('PATCH', `/api/v1/cart/items/${itemId}`, { cart_id: cartId, quantity: q });
      assertEqual(res.status, 200, `Oscillate to ${q} status`);
      assertEqual(res.body.items[0].quantity, q, `Oscillate to ${q} quantity`);
      const expectedSubtotal = Number((q * 59.00).toFixed(2));
      assertEqual(res.body.subtotal, expectedSubtotal, `Oscillate to ${q} subtotal`);
      const expectedDiscount = Number(((expectedSubtotal * 20) / 100).toFixed(2));
      assertEqual(res.body.discount, expectedDiscount, `Oscillate to ${q} discount`);
    }
  });

  await test('5.2 SQL Injection payload in shipping address is stored safely as literal', async () => {
    const cartId = `challenger_sqli_addr_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });

    const maliciousAddress = "'; DROP TABLE orders; -- 123 Hackers Lane";
    const res = await request('POST', '/api/v1/checkout', {
      cart_id: cartId,
      shipping_address: maliciousAddress
    });
    assertEqual(res.status, 200, 'SQLi address checkout must succeed safely');
    assertEqual(res.body.shipping_address, maliciousAddress, 'Stored verbatim without SQL execution');

    // Verify orders table is still fully operational
    const cartId2 = `challenger_sqli_verify_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId2, product_id: 3, quantity: 1 });
    const res2 = await request('POST', '/api/v1/checkout', {
      cart_id: cartId2,
      shipping_address: '456 Normal St'
    });
    assertEqual(res2.status, 200, 'Orders table intact');
  });

  await test('5.3 XSS and Script tags in shipping address stored safely without 500 error', async () => {
    const cartId = `challenger_xss_addr_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });

    const xssAddress = '<script>alert("pwned")</script> 123 Web St';
    const res = await request('POST', '/api/v1/checkout', {
      cart_id: cartId,
      shipping_address: xssAddress
    });
    assertEqual(res.status, 200, 'XSS address status');
    assertEqual(res.body.shipping_address, xssAddress, 'XSS address safely stored');
  });

  await test('5.4 Very long shipping address (2048 chars) handled gracefully', async () => {
    const cartId = `challenger_long_addr_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });

    const longAddress = 'A'.repeat(2048);
    const res = await request('POST', '/api/v1/checkout', {
      cart_id: cartId,
      shipping_address: longAddress
    });
    assertEqual(res.status, 200, 'Long address status');
    assertEqual(res.body.shipping_address.length, 2048, 'Long address length');
  });


  // -------------------------------------------------------------------
  // SUITE 6: Concurrency, Bridge Security & Severity Validation
  // -------------------------------------------------------------------
  console.log('\n\x1b[1m\x1b[36m--- Suite 6: Concurrency, Bridge Security & Severity Validation ---\x1b[0m');

  await test('6.1 Concurrent PATCH quantity requests maintain consistency', async () => {
    const cartId = `challenger_concurrent_patch_${Date.now()}`;
    const addRes = await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });
    const itemId = addRes.body.items[0].id;

    // Fire 20 concurrent PATCH requests with valid quantities 1 to 5
    const patchPromises = Array.from({ length: 20 }, (_, i) =>
      request('PATCH', `/api/v1/cart/items/${itemId}`, { cart_id: cartId, quantity: (i % 5) + 1 })
    );

    const results = await Promise.all(patchPromises);
    for (const r of results) {
      assertEqual(r.status, 200, 'Concurrent PATCH must succeed');
      assert(r.body.items.length === 1, 'Cart must keep 1 item');
    }

    // Read final cart
    const finalCart = await request('GET', `/api/v1/cart?cart_id=${cartId}`);
    assert(finalCart.body.items.length === 1, 'Final cart must have 1 item');
    const finalQty = finalCart.body.items[0].quantity;
    assert(finalQty >= 1 && finalQty <= 5, 'Final quantity must be within 1..5');
    assertEqual(finalCart.body.subtotal, Number((finalQty * 59.00).toFixed(2)), 'Final subtotal matches final quantity');
  });

  await test('6.2 Coupon code normalization: lowercase and padded codes are normalized and accepted', async () => {
    const cartId = `challenger_coupon_norm_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });

    const couponRes = await request('POST', '/api/v1/cart/apply-coupon', {
      cart_id: cartId,
      coupon_code: '  save20  '
    });
    assertEqual(couponRes.status, 200, 'Normalized coupon accepted');
    assertEqual(couponRes.body.applied_coupon, 'SAVE20', 'Normalized to uppercase SAVE20');
    assertEqual(couponRes.body.discount, 11.80, 'Discount applied');
  });

  await test('6.3 Inactive coupon code (EXPIRED99) rejected with 400 INVALID_COUPON', async () => {
    const cartId = `challenger_coupon_expired_${Date.now()}`;
    await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 1 });

    const couponRes = await request('POST', '/api/v1/cart/apply-coupon', {
      cart_id: cartId,
      coupon_code: 'EXPIRED99'
    });
    assertEqual(couponRes.status, 400, 'Expired coupon rejected');
    assertEqual(couponRes.body.error, 'INVALID_COUPON', 'Error is INVALID_COUPON');
  });

  await test('6.4 Invalid initial quantity on POST /api/v1/cart/items rejected with 400 INVALID_QUANTITY', async () => {
    const cartId = `challenger_cart_add_inv_${Date.now()}`;

    // Negative quantity
    const resNeg = await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: -2 });
    assertEqual(resNeg.status, 400, 'Negative add rejected');
    assertEqual(resNeg.body.error, 'INVALID_QUANTITY', 'Error is INVALID_QUANTITY');

    // Zero quantity
    const resZero = await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 0 });
    assertEqual(resZero.status, 400, 'Zero add rejected');
    assertEqual(resZero.body.error, 'INVALID_QUANTITY', 'Error is INVALID_QUANTITY');

    // Non-numeric string quantity
    const resString = await request('POST', '/api/v1/cart/items', { cart_id: cartId, product_id: 3, quantity: 'not_a_number' });
    assertEqual(resString.status, 400, 'Non-numeric string add rejected');
    assertEqual(resString.body.error, 'INVALID_QUANTITY', 'Error is INVALID_QUANTITY');
  });

  await test('6.5 Checkout on empty cart returns 400 EMPTY_CART', async () => {
    const cartId = `challenger_empty_checkout_${Date.now()}`;
    await request('GET', `/api/v1/cart?cart_id=${cartId}`);

    const res = await request('POST', '/api/v1/checkout', {
      cart_id: cartId,
      shipping_address: '123 Empty Lane'
    });
    assertEqual(res.status, 400, 'Empty cart checkout returns 400');
    assertEqual(res.body.error, 'EMPTY_CART', 'Error is EMPTY_CART');
  });

  await test('6.6 Bridge sync_source path traversal vectors rejected with 403 FORBIDDEN_PATH_TRAVERSAL', async () => {
    const badTargets = [
      '../../etc/passwd',
      '..\\..\\windows\\win.ini',
      'foo/../../src_traversal/test.txt',
      '../../../../../../../../etc/shadow'
    ];

    for (const target of badTargets) {
      const res = await request('POST', '/api/v1/bridge/v1/exec', {
        command: 'sync_source',
        params: {
          target_file: target,
          content: '// malicious'
        }
      }, {
        'Authorization': 'Bearer quickcart-sre-secret-token'
      });
      assertEqual(res.status, 403, `Path traversal ${target} must return 403`);
      assertEqual(res.body.error, 'FORBIDDEN_PATH_TRAVERSAL', 'Error code must be FORBIDDEN_PATH_TRAVERSAL');
    }
  });

  await test('6.7 SRE Bridge command unauthorized access returns 401 UNAUTHORIZED_BRIDGE_ACCESS', async () => {
    const res = await request('POST', '/api/v1/bridge/v1/exec', { command: 'inspect_cache' });
    assertEqual(res.status, 401, 'Unauthorized bridge access returns 401');
    assertEqual(res.body.error, 'UNAUTHORIZED_BRIDGE_ACCESS', 'Error code UNAUTHORIZED_BRIDGE_ACCESS');
  });


  // -------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------
  console.log('\n======================================================================');
  console.log('  CHALLENGER VERIFICATION SUMMARY');
  console.log('======================================================================');
  console.log(`  Total Tests Run:  ${totalTests}`);
  console.log(`  Passed Tests:     \x1b[32m${passedTests}\x1b[0m`);
  console.log(`  Failed Tests:     ${failedTests > 0 ? `\x1b[31m${failedTests}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);
  console.log('======================================================================\n');

  if (failedTests > 0) {
    console.error('FAILURES:');
    for (const f of failures) {
      console.error(`  - ${f.name}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('\x1b[32m🎉 ALL ADVERSARIAL CHALLENGER TESTS PASSED EMPIRICALLY!\x1b[0m\n');
    process.exit(0);
  }
}

runAll().catch(err => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
