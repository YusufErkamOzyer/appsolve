/**
 * High-Fidelity Mock Server for QuickCart & Appsolve Interfaces
 * Fully implements the interface contracts defined in PROJECT.md, Survey 2 & 3.
 * Used for standalone E2E test verification and CI runs when full multi-process daemons are not running.
 */

const http = require('node:http');
const crypto = require('node:crypto');

class MockState {
  constructor() {
    this.reset();
  }

  reset() {
    this.users = new Map();
    this.sessions = new Map();
    this.products = [
      { id: 1, sku: 'QC-ELEC-01', name: 'Wireless Noise-Canceling Headphones', category: 'Electronics', price: 199.99, stock_quantity: 45, is_active: 1, description: 'Premium audio headphones' },
      { id: 2, sku: 'QC-ELEC-02', name: 'Mechanical Gaming Keyboard', category: 'Electronics', price: 129.50, stock_quantity: 30, is_active: 1, description: 'RGB mechanical switches' },
      { id: 3, sku: 'QC-APP-01', name: 'Organic Cotton Hoodie', category: 'Apparel', price: 59.00, stock_quantity: 100, is_active: 1, description: 'Comfort fit warm hoodie' },
      { id: 4, sku: 'QC-HOME-01', name: 'Smart Aroma Diffuser', category: 'Home', price: 34.99, stock_quantity: 60, is_active: 1, description: 'Ultrasonic essential oil diffuser' },
      { id: 5, sku: 'QC-ACC-01', name: 'Waterproof Laptop Sleeve', category: 'Accessories', price: 24.95, stock_quantity: 80, is_active: 1, description: 'Protective neoprene case' }
    ];
    this.catalogCache = new Map();
    this.carts = new Map();
    this.orders = new Map();
    this.coupons = new Map([
      ['SAVE20', { code: 'SAVE20', type: 'percent', value: 20, min_subtotal: 50, active: true }],
      ['FLAT10', { code: 'FLAT10', type: 'fixed', value: 10, min_subtotal: 20, active: true }],
      ['CHAOS2026', { code: 'CHAOS2026', type: 'percent', value: 25, min_subtotal: 0, active: true }],
      ['EXPIRED99', { code: 'EXPIRED99', type: 'percent', value: 99, min_subtotal: 0, active: false }]
    ]);
    this.incidents = [];
    this.telemetrySignals = [];
    this.auditLogs = [];

    // Chaos & Fault Injection Flags
    this.checkoutDeadlockActive = false;
    this.deadlockHoldPid = 4821;
    this.cacheBloatCount = 0;
    this.couponBugActive = false;
    this.systemStatus = 'all_operational';
  }
}

class MockServerInstance {
  constructor(port = 4000, options = {}) {
    this.port = port;
    this.appsolvePort = options.appsolvePort || 3001;
    this.state = new MockState();
    this.server = null;
    this.appsolveServer = null;
    this.bridgeSecret = 'quickcart-sre-secret-token';
  }

  start() {
    return new Promise((resolve, reject) => {
      // Main QuickCart Server (or combined on port 4000)
      this.server = http.createServer((req, res) => this.handleQuickcartRequest(req, res));
      
      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          // Address in use, fallback to dynamic port
          this.server.listen(0, '127.0.0.1', () => {
            this.port = this.server.address().port;
            this.startAppsolveServer().then(resolve).catch(reject);
          });
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this.port = this.server.address().port;
        this.startAppsolveServer().then(resolve).catch(reject);
      });
    });
  }

  startAppsolveServer() {
    return new Promise((resolve) => {
      this.appsolveServer = http.createServer((req, res) => this.handleAppsolveRequest(req, res));
      this.appsolveServer.on('error', () => {
        this.appsolveServer.listen(0, '127.0.0.1', () => {
          this.appsolvePort = this.appsolveServer.address().port;
          resolve();
        });
      });
      this.appsolveServer.listen(this.appsolvePort, '127.0.0.1', () => {
        this.appsolvePort = this.appsolveServer.address().port;
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      let closed = 0;
      const onClosed = () => {
        closed++;
        if (closed >= 2) resolve();
      };
      if (this.server) this.server.close(onClosed); else onClosed();
      if (this.appsolveServer) this.appsolveServer.close(onClosed); else onClosed();
    });
  }

  async readBody(req) {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        if (!data) return resolve({});
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ rawText: data });
        }
      });
    });
  }

  sendJson(res, statusCode, body, extraHeaders = {}) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders
    });
    res.end(JSON.stringify(body));
  }

  async handleQuickcartRequest(req, res) {
    const urlObj = new URL(req.url, `http://127.0.0.1:${this.port}`);
    const pathname = urlObj.pathname;
    const method = req.method.toUpperCase();

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Appsolve-Bridge-Token'
      });
      return res.end();
    }

    const body = await this.readBody(req);
    const authHeader = req.headers['authorization'] || '';
    const bridgeHeader = req.headers['x-appsolve-bridge-token'] || '';

    // ==========================================
    // 1. AUTH DOMAIN (/api/v1/auth/* or /api/auth/*)
    // ==========================================
    if (pathname.includes('/auth/register') && method === 'POST') {
      const { email, password, full_name } = body;
      if (!email || !password || typeof email !== 'string' || !email.includes('@')) {
        return this.sendJson(res, 400, { error: 'INVALID_INPUT', message: 'Valid email and password required' });
      }
      if (this.state.users.has(email)) {
        return this.sendJson(res, 409, { error: 'EMAIL_ALREADY_REGISTERED', message: 'Email already exists' });
      }
      const userId = this.state.users.size + 1;
      const user = { id: userId, email, full_name: full_name || 'QuickCart Customer' };
      this.state.users.set(email, { ...user, password });
      const token = `qc_jwt_${crypto.randomBytes(16).toString('hex')}`;
      this.state.sessions.set(token, user);
      return this.sendJson(res, 201, { token, user });
    }

    if (pathname.includes('/auth/login') && method === 'POST') {
      const { email, password } = body;
      if (!email || !password) {
        return this.sendJson(res, 400, { error: 'INVALID_CREDENTIALS', message: 'Email and password required' });
      }
      const existing = this.state.users.get(email);
      if (!existing || existing.password !== password) {
        return this.sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Invalid credentials' });
      }
      const token = `qc_jwt_${crypto.randomBytes(16).toString('hex')}`;
      const user = { id: existing.id, email: existing.email, full_name: existing.full_name };
      this.state.sessions.set(token, user);
      return this.sendJson(res, 200, { token, user });
    }

    if (pathname.includes('/auth/me') && method === 'GET') {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) {
        return this.sendJson(res, 401, { error: 'MISSING_TOKEN', message: 'Bearer token required' });
      }
      if (token === 'expired-token') {
        return this.sendJson(res, 401, { error: 'TOKEN_EXPIRED', message: 'JWT token has expired' });
      }
      if (token.startsWith('malformed')) {
        return this.sendJson(res, 401, { error: 'MALFORMED_TOKEN', message: 'Token is malformed' });
      }
      const user = this.state.sessions.get(token);
      if (!user) {
        return this.sendJson(res, 401, { error: 'INVALID_TOKEN', message: 'User session not found' });
      }
      return this.sendJson(res, 200, { user });
    }

    // ==========================================
    // 2. CATALOG DOMAIN (/api/v1/catalog/* or /api/catalog/*)
    // ==========================================
    if (pathname.includes('/catalog/products') && method === 'GET') {
      const parts = pathname.split('/');
      const lastPart = parts[parts.length - 1];
      const isDetail = lastPart !== 'products' && !isNaN(parseInt(lastPart, 10));

      if (isDetail) {
        const id = parseInt(lastPart, 10);
        const product = this.state.products.find(p => p.id === id);
        if (!product) {
          return this.sendJson(res, 404, { error: 'PRODUCT_NOT_FOUND', message: `Product ${id} not found` });
        }
        return this.sendJson(res, 200, { product });
      }

      // Products listing
      const category = urlObj.searchParams.get('category');
      const search = urlObj.searchParams.get('search');
      const limit = parseInt(urlObj.searchParams.get('limit') || '20', 10);
      const offset = Math.max(0, parseInt(urlObj.searchParams.get('offset') || '0', 10));

      const cacheKey = `cat_${category || 'all'}_s_${search || 'none'}_l_${limit}_o_${offset}`;
      const isCached = this.state.catalogCache.has(cacheKey);

      let filtered = this.state.products.filter(p => p.is_active === 1);
      if (category) {
        filtered = filtered.filter(p => p.category.toLowerCase() === category.toLowerCase());
      }
      if (search) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.description && p.description.toLowerCase().includes(search.toLowerCase())));
      }

      const paged = filtered.slice(offset, offset + (limit > 0 ? limit : 20));

      // Record cache hit
      this.state.catalogCache.set(cacheKey, Date.now());

      return this.sendJson(res, 200, {
        products: paged,
        count: filtered.length,
        cached: isCached
      }, {
        'X-Cache': isCached ? 'HIT' : 'MISS'
      });
    }

    if (pathname.includes('/catalog/categories') && method === 'GET') {
      const categories = Array.from(new Set(this.state.products.map(p => p.category)));
      return this.sendJson(res, 200, { categories });
    }

    // ==========================================
    // 3. CART DOMAIN (/api/v1/cart/* or /api/cart/*)
    // ==========================================
    if (pathname.endsWith('/cart') && method === 'GET') {
      const cartId = urlObj.searchParams.get('cart_id') || 'cart_default';
      let cart = this.state.carts.get(cartId);
      if (!cart) {
        cart = { id: cartId, items: [], subtotal: 0, applied_coupon: null, discount: 0, tax: 0, total: 0 };
        this.state.carts.set(cartId, cart);
      }
      return this.sendJson(res, 200, cart);
    }

    if (pathname.includes('/cart/items') && method === 'POST') {
      const { cart_id, product_id, quantity } = body;
      const cartKey = cart_id || 'cart_default';
      let cart = this.state.carts.get(cartKey) || { id: cartKey, items: [], subtotal: 0, applied_coupon: null, discount: 0, tax: 0, total: 0 };

      const product = this.state.products.find(p => p.id === parseInt(product_id, 10));
      if (!product) {
        return this.sendJson(res, 404, { error: 'PRODUCT_NOT_FOUND', message: 'Product does not exist' });
      }

      const qty = parseInt(quantity || '1', 10);
      if (qty <= 0) {
        return this.sendJson(res, 400, { error: 'INVALID_QUANTITY', message: 'Quantity must be > 0' });
      }
      if (qty > product.stock_quantity) {
        return this.sendJson(res, 400, { error: 'OUT_OF_STOCK', message: `Requested quantity exceeds stock (${product.stock_quantity})` });
      }

      const existingItem = cart.items.find(i => i.product_id === product.id);
      if (existingItem) {
        existingItem.quantity += qty;
        existingItem.item_total = parseFloat((existingItem.quantity * existingItem.price).toFixed(2));
      } else {
        cart.items.push({
          id: cart.items.length + 1,
          product_id: product.id,
          name: product.name,
          price: product.price,
          quantity: qty,
          item_total: parseFloat((qty * product.price).toFixed(2))
        });
      }

      this.recalculateCart(cart);
      this.state.carts.set(cartKey, cart);
      return this.sendJson(res, 200, cart);
    }

    if (pathname.includes('/cart/items/') && (method === 'PATCH' || method === 'PUT')) {
      const itemId = parseInt(pathname.split('/').pop(), 10);
      const cartKey = body.cart_id || urlObj.searchParams.get('cart_id') || 'cart_default';
      const cart = this.state.carts.get(cartKey);
      if (!cart) {
        return this.sendJson(res, 404, { error: 'CART_NOT_FOUND', message: 'Cart not found' });
      }
      const item = cart.items.find(i => i.id === itemId);
      if (!item) {
        return this.sendJson(res, 404, { error: 'ITEM_NOT_FOUND', message: 'Cart item not found' });
      }
      const qty = parseInt(body.quantity, 10);
      if (qty <= 0) {
        cart.items = cart.items.filter(i => i.id !== itemId);
      } else {
        item.quantity = qty;
        item.item_total = parseFloat((qty * item.price).toFixed(2));
      }
      this.recalculateCart(cart);
      return this.sendJson(res, 200, cart);
    }

    if (pathname.includes('/cart/items/') && method === 'DELETE') {
      const itemId = parseInt(pathname.split('/').pop(), 10);
      const cartKey = urlObj.searchParams.get('cart_id') || 'cart_default';
      const cart = this.state.carts.get(cartKey);
      if (!cart) {
        return this.sendJson(res, 404, { error: 'CART_NOT_FOUND', message: 'Cart not found' });
      }
      cart.items = cart.items.filter(i => i.id !== itemId);
      this.recalculateCart(cart);
      return this.sendJson(res, 200, cart);
    }

    if ((pathname.includes('/cart/coupon') || pathname.includes('/cart/apply-coupon')) && method === 'POST') {
      const { cart_id, coupon_code } = body;
      const cartKey = cart_id || 'cart_default';
      const cart = this.state.carts.get(cartKey);
      if (!cart) {
        return this.sendJson(res, 404, { error: 'CART_NOT_FOUND', message: 'Cart not found' });
      }

      // Check if SEV-2 bug is currently active
      if (this.state.couponBugActive) {
        // Forward error telemetry to Appsolve
        this.emitTelemetrySignal({
          service_slug: 'cart',
          error_code: 'ERR_COUPON_CALCULATION',
          message: "TypeError: Cannot read properties of undefined (reading 'multiplier') in couponService.ts:42",
          severity: 'sev2',
          raw_payload: {
            stack_trace: "TypeError: Cannot read properties of undefined (reading 'multiplier')\n    at calculateCouponDiscount (/quickcart/backend/src/services/couponService.ts:42:28)",
            source_file: "quickcart/backend/src/services/couponService.ts",
            line_number: 42
          }
        });
        return this.sendJson(res, 500, {
          error: 'ERR_COUPON_CALCULATION',
          message: "TypeError: Cannot read properties of undefined (reading 'multiplier')",
          service: 'cart',
          telemetry_forwarded: true
        });
      }

      const coupon = this.state.coupons.get(coupon_code);
      if (!coupon || !coupon.active) {
        return this.sendJson(res, 400, { error: 'INVALID_COUPON', message: `Coupon code '${coupon_code}' is invalid or expired` });
      }

      if (cart.subtotal < coupon.min_subtotal) {
        return this.sendJson(res, 400, { error: 'COUPON_MIN_SUBTOTAL', message: `Minimum order amount of $${coupon.min_subtotal} required` });
      }

      cart.applied_coupon = coupon.code;
      this.recalculateCart(cart);
      return this.sendJson(res, 200, cart);
    }

    // ==========================================
    // 4. CHECKOUT DOMAIN (/api/v1/checkout or /api/checkout)
    // ==========================================
    if (pathname.includes('/checkout') && method === 'POST') {
      const { cart_id, shipping_address, payment_method } = body;
      const cartKey = cart_id || 'cart_default';
      const cart = this.state.carts.get(cartKey);

      if (!cart || cart.items.length === 0) {
        return this.sendJson(res, 400, { error: 'EMPTY_CART', message: 'Cannot checkout with an empty cart' });
      }

      if (!shipping_address || (typeof shipping_address === 'string' && shipping_address.trim().length === 0)) {
        return this.sendJson(res, 400, { error: 'MISSING_SHIPPING_ADDRESS', message: 'Shipping address required' });
      }

      // Check for SEV-1 Deadlock Active
      if (this.state.checkoutDeadlockActive) {
        this.emitTelemetrySignal({
          service_slug: 'checkout',
          error_code: 'ERR_DB_LOCK_TIMEOUT',
          message: `SQLITE_BUSY: database is locked waiting on PID ${this.state.deadlockHoldPid}`,
          severity: 'sev1',
          raw_payload: {
            stack_trace: "Error: SQLITE_BUSY: database table payment_records locked\n    at acquirePaymentRowLock (/quickcart/backend/src/db/locks.ts:38:11)",
            source_file: "quickcart/backend/src/db/locks.ts",
            line_number: 38,
            context: { blocking_pid: this.state.deadlockHoldPid, table: 'payment_records' }
          }
        });
        return this.sendJson(res, 504, {
          error: 'DB_LOCK_TIMEOUT',
          message: 'Checkout transaction timed out waiting on database lock',
          service: 'checkout',
          telemetry_forwarded: true
        });
      }

      // Reserve stock & check inventory
      for (const item of cart.items) {
        const prod = this.state.products.find(p => p.id === item.product_id);
        if (prod) {
          prod.stock_quantity = Math.max(0, prod.stock_quantity - item.quantity);
        }
      }

      const orderUuid = `qc_ord_${crypto.randomBytes(8).toString('hex')}`;
      const order = {
        order_uuid: orderUuid,
        cart_id: cartKey,
        items: [...cart.items],
        subtotal: cart.subtotal,
        discount: cart.discount,
        tax: cart.tax,
        total: cart.total,
        status: 'paid',
        payment_status: 'captured',
        shipping_address,
        created_at: new Date().toISOString()
      };
      this.state.orders.set(orderUuid, order);

      // Clear cart
      cart.items = [];
      cart.applied_coupon = null;
      this.recalculateCart(cart);

      return this.sendJson(res, 200, order);
    }

    // ==========================================
    // 5. REMOTE SRE SANDBOX BRIDGE (/api/bridge/v1/*)
    // ==========================================
    if (pathname.includes('/api/bridge/v1/')) {
      // Validate Bearer or X-Appsolve-Bridge-Token
      const token = (authHeader.replace(/^Bearer\s+/i, '') || bridgeHeader).trim();
      if (!token || token !== this.bridgeSecret) {
        return this.sendJson(res, 401, { error: 'UNAUTHORIZED_BRIDGE_ACCESS', message: 'Valid SRE Bridge token required' });
      }

      if (pathname.endsWith('/exec') || pathname.endsWith('/execute')) {
        const { command, params } = body;
        if (!command) {
          return this.sendJson(res, 400, { error: 'MISSING_COMMAND', message: 'Command parameter is required' });
        }

        const auditEntry = {
          command,
          timestamp: new Date().toISOString(),
          requested_by: 'appsolve_sre'
        };
        this.state.auditLogs.push(auditEntry);

        switch (command) {
          case 'inspect_db_locks':
            return this.sendJson(res, 200, {
              status: 'success',
              command,
              output: this.state.checkoutDeadlockActive
                ? `1 active blocking transaction detected on table 'payment_records' (PID: ${this.state.deadlockHoldPid})`
                : 'No active blocking locks detected. Database pool healthy.',
              data: {
                active_locks: this.state.checkoutDeadlockActive ? 1 : 0,
                blocking_pid: this.state.checkoutDeadlockActive ? this.state.deadlockHoldPid : null,
                table: 'payment_records',
                status: this.state.checkoutDeadlockActive ? 'BLOCKED' : 'HEALTHY'
              }
            });

          case 'kill_db_locks':
            const wasDeadlocked = this.state.checkoutDeadlockActive;
            this.state.checkoutDeadlockActive = false;
            this.state.systemStatus = 'all_operational';
            return this.sendJson(res, 200, {
              status: 'success',
              command,
              output: `Terminated hanging transaction thread PID ${this.state.deadlockHoldPid}. Released row-level locks on payment_records. Recycled connection pool.`,
              data: {
                terminated_transactions: wasDeadlocked ? 1 : 0,
                cleared_locks: wasDeadlocked ? 48 : 0,
                pool_reset: true
              }
            });

          case 'inspect_cache':
            return this.sendJson(res, 200, {
              status: 'success',
              command,
              output: `Catalog in-memory cache size: ${this.state.catalogCache.size + this.state.cacheBloatCount} entries.`,
              data: {
                total_keys: this.state.catalogCache.size + this.state.cacheBloatCount,
                bloat_count: this.state.cacheBloatCount,
                memory_pressure: this.state.cacheBloatCount > 5000 ? 'CRITICAL (94%)' : 'NORMAL (28%)'
              }
            });

          case 'purge_cache':
            const freed = this.state.catalogCache.size + this.state.cacheBloatCount;
            this.state.catalogCache.clear();
            this.state.cacheBloatCount = 0;
            return this.sendJson(res, 200, {
              status: 'success',
              command,
              output: `Purged ${freed} catalog cache entries. Memory pressure normalized.`,
              data: {
                purged_keys: freed,
                memory_freed_mb: 450,
                current_pressure: 'NORMAL'
              }
            });

          case 'sync_source':
            const targetFile = params?.target_file || params?.file_path || '';
            // Path traversal protection
            if (targetFile.includes('..') || targetFile.startsWith('/') || targetFile.includes('etc')) {
              return this.sendJson(res, 403, { error: 'FORBIDDEN_PATH_TRAVERSAL', message: 'Path traversal forbidden' });
            }
            if (targetFile.includes('couponService') || targetFile.includes('cart')) {
              this.state.couponBugActive = false; // Hot-reloaded fixed code
            }
            return this.sendJson(res, 200, {
              status: 'success',
              command,
              output: `Source file '${targetFile}' safely synced and reloaded into require cache.`,
              data: {
                target_file: targetFile,
                status: 'synced_and_reloaded'
              }
            });

          case 'health_check':
            return this.sendJson(res, 200, {
              status: 'success',
              command,
              output: 'All QuickCart subsystem services operational.',
              data: {
                auth: 200,
                catalog: 200,
                cart: 200,
                checkout: this.state.checkoutDeadlockActive ? 504 : 200,
                healthy: !this.state.checkoutDeadlockActive
              }
            });

          default:
            return this.sendJson(res, 400, { error: 'UNKNOWN_BRIDGE_COMMAND', message: `Unknown command: ${command}` });
        }
      }
    }

    // ==========================================
    // 6. CHAOS TRIGGERS (/api/v1/chaos/* or /api/chaos/*)
    // ==========================================
    if (pathname.includes('/chaos/')) {
      if (pathname.endsWith('/bloat-cache')) {
        this.state.cacheBloatCount = 12500;
        return this.sendJson(res, 200, { message: 'Injected 12,500 bloat cache keys (SEV-3)', bloat_count: 12500 });
      }
      if (pathname.endsWith('/inject-coupon-bug')) {
        this.state.couponBugActive = true;
        return this.sendJson(res, 200, { message: 'Injected coupon NaN calculation error (SEV-2)' });
      }
      if (pathname.endsWith('/lock-checkout')) {
        this.state.checkoutDeadlockActive = true;
        this.state.systemStatus = 'major_outage';
        return this.sendJson(res, 200, { message: 'Acquired exclusive blocking lock on payment_records (SEV-1)', blocking_pid: this.state.deadlockHoldPid });
      }
      if (pathname.endsWith('/reset')) {
        this.state.reset();
        return this.sendJson(res, 200, { message: 'Reset all QuickCart state to healthy defaults' });
      }
    }

    // 404 for unmatched
    return this.sendJson(res, 404, { error: 'NOT_FOUND', path: pathname });
  }

  async handleAppsolveRequest(req, res) {
    const urlObj = new URL(req.url, `http://127.0.0.1:${this.appsolvePort}`);
    const pathname = urlObj.pathname;
    const method = req.method.toUpperCase();

    const body = await this.readBody(req);

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      return res.end();
    }

    // Telemetry signals ingestion (/api/v1/telemetry/signals)
    if (pathname.includes('/telemetry/signals') && method === 'POST') {
      const incidentId = this.state.incidents.length + 1;
      const incident = {
        id: incidentId,
        incident_code: `#INC-${100 + incidentId}`,
        service_slug: body.service_slug || 'cart',
        error_code: body.error_code || 'ERR_GENERIC',
        severity: body.severity || 'sev2',
        status: 'investigating',
        autonomy_mode: body.severity === 'sev3' ? 'full_autonomy' : (body.severity === 'sev1' ? 'manual_command_only' : 'approval_required'),
        created_at: new Date().toISOString(),
        raw_payload: body.raw_payload || {}
      };
      this.state.incidents.push(incident);
      this.state.telemetrySignals.push({ ...body, received_at: new Date().toISOString() });

      return this.sendJson(res, 201, {
        status: 'accepted',
        message: 'Telemetry signal ingested and AI triage completed',
        incident
      });
    }

    // Public Status API (/api/v1/services)
    if (pathname.includes('/api/v1/services') && method === 'GET') {
      const services = [
        { id: 1, slug: 'auth', name: 'Giriş (Auth)', status: 'operational' },
        { id: 2, slug: 'catalog', name: 'Katalog (Catalog)', status: this.state.cacheBloatCount > 0 ? 'degraded' : 'operational' },
        { id: 3, slug: 'cart', name: 'Sepet (Cart)', status: this.state.couponBugActive ? 'degraded' : 'operational' },
        { id: 4, slug: 'checkout', name: 'Ödeme (Checkout)', status: this.state.checkoutDeadlockActive ? 'outage' : 'operational' }
      ];
      let sysStatus = 'all_operational';
      if (this.state.checkoutDeadlockActive) sysStatus = 'major_outage';
      else if (this.state.couponBugActive || this.state.cacheBloatCount > 0) sysStatus = 'partial_outage';

      return this.sendJson(res, 200, {
        system_status: sysStatus,
        services,
        last_synced_at: new Date().toISOString()
      });
    }

    // Reset API
    if (pathname.includes('/system/reset') && method === 'POST') {
      this.state.reset();
      return this.sendJson(res, 200, { status: 'success', message: 'System state reset' });
    }

    return this.sendJson(res, 404, { error: 'NOT_FOUND', path: pathname });
  }

  emitTelemetrySignal(signal) {
    this.state.telemetrySignals.push({ ...signal, emitted_at: new Date().toISOString() });
  }

  recalculateCart(cart) {
    let subtotal = 0;
    for (const item of cart.items) {
      item.item_total = parseFloat((item.quantity * item.price).toFixed(2));
      subtotal += item.item_total;
    }
    cart.subtotal = parseFloat(subtotal.toFixed(2));

    let discount = 0;
    if (cart.applied_coupon) {
      const coupon = this.state.coupons.get(cart.applied_coupon);
      if (coupon && coupon.active && cart.subtotal >= coupon.min_subtotal) {
        if (coupon.type === 'percent') {
          discount = (cart.subtotal * coupon.value) / 100;
        } else if (coupon.type === 'fixed') {
          discount = coupon.value;
        }
      }
    }
    // Cap discount to never exceed subtotal
    discount = Math.min(cart.subtotal, discount);
    cart.discount = parseFloat(discount.toFixed(2));

    const taxableAmount = Math.max(0, cart.subtotal - cart.discount);
    cart.tax = parseFloat((taxableAmount * 0.08).toFixed(2));
    cart.total = parseFloat((taxableAmount + cart.tax).toFixed(2));
  }
}

module.exports = {
  MockServerInstance,
  MockState
};
