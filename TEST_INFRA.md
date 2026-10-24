# E2E Test Infrastructure Specification

## 1. Overview & Testing Philosophy
The QuickCart and Appsolve E2E test infrastructure provides an independent, opaque-box, black-box verification suite located in `test/e2e/`.

The test suite operates strictly over HTTP network boundaries without importing private internal classes or inspecting internal module state. It evaluates the ecosystem exactly as a real customer mobile application, an on-call SRE engineer, or an external telemetry forwarder interacts with it.

### Core Testing Tenets:
1. **Opaque-Box Independence**: Tests interact solely via standard HTTP requests (GET, POST, PATCH, PUT, DELETE) and evaluate observable status codes, headers, and JSON payloads.
2. **Zero-Dependency Portability**: Built with pure Node.js v26 built-ins (`node:http`, `node:assert`, `node:crypto`). Runs out of the box on any developer machine or CI container without requiring `npm install` or third-party test framework overhead.
3. **Dual-Mode Execution**:
   - **Live Target Mode**: Connects to live running services (`http://localhost:4000` for QuickCart, `http://localhost:3001` for Appsolve Rails backend).
   - **Embedded Contract Mock Mode**: Automatically detects if live servers are offline and boots an in-process, high-fidelity contract-compliant mock server, ensuring 100% test suite runnable validity and syntax verification at any time.
4. **4-Tier Hierarchical Methodology**: Structures tests into distinct tiers from isolated feature verification to complex multi-step chaos incident lifecycles.

---

## 2. The 4-Tier Test Methodology

```
+--------------------------------------------------------------------------+
| Tier 4: Real-World Scenarios & Incidents                                 |
| - Complete Customer Journey (browsing -> cart edit -> coupon -> order)   |
| - High-Concurrency Flash Sale (5 concurrent shoppers, zero stock drift)  |
| - SEV-3 Cache Bloat Autonomous Remediation Scenario                      |
| - SEV-2 Coupon Bug GitHub PR & Hot-Reload Remediation Scenario           |
| - SEV-1 Checkout Database Deadlock & SRE Bridge Termination Scenario      |
| - Mobile Client Public Status API Outage & Recovery Journey              |
+--------------------------------------------------------------------------+
| Tier 3: Cross-Feature Combinations & System Loops                        |
| - Pairwise Auth -> Catalog Browsing                                      |
| - Pairwise Catalog Selection -> Cart Item Math                           |
| - Cart Coupon Discount -> Final Checkout Total Matching                  |
| - Authenticated Session -> Cart -> Checkout Binding                      |
| - Error Telemetry -> Ingestion -> SRE Bridge Hot-Reload                  |
| - Checkout Deadlock 504 -> SRE Bridge Lock Killing Recovery              |
| - Cache Bloat Latency -> SRE Bridge Cache Purge Normalization            |
| - Full 5-Step Shopping Lifecycle                                         |
+--------------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases (>=5 per feature)                        |
| - Auth: Expired JWT, malformed header, empty credentials, SQL injection  |
| - Catalog: 404 ID, empty category, extreme pagination, regex search      |
| - Cart: Empty cart checkout, invalid coupon, expired coupon, stock limit|
| - Checkout: Zero/negative quantity, active deadlock 504, double submit   |
| - Telemetry: Missing stack, missing raw payload, burst load, large trace |
| - SRE Bridge: Tampered token 401, unknown command 400, path traversal 403|
+--------------------------------------------------------------------------+
| Tier 1: Feature Coverage (>=5 per feature)                               |
| - Auth: Registration, login, /auth/me, invalid password, duplicate email |
| - Catalog: Products list, product detail, categories, X-Cache HIT/MISS   |
| - Cart: Cart read, add item, patch quantity, delete item, discount math  |
| - Checkout: Order placement, payment captured, cart cleared, stock decr  |
| - Telemetry: Signal ingestion 201, service mapping, stack attribution    |
| - SRE Bridge: inspect_db_locks, kill_db_locks, purge_cache, health_check |
+--------------------------------------------------------------------------+
```

---

## 3. Directory & File Organization

```
test/e2e/
├── runner.js                      # Primary test runner CLI with tier routing and reporting
├── lib/
│   ├── harness.js                 # Zero-dependency test harness (describe, it, expect, assertions)
│   ├── client.js                  # HTTP client wrapper with Bearer & Bridge auth helpers
│   └── mock-server.js             # Contract-compliant embedded HTTP server for autonomous execution
└── tiers/
    ├── tier1_features/            # Tier 1: Feature Coverage (37 tests)
    │   ├── auth.test.js
    │   ├── catalog.test.js
    │   ├── cart.test.js
    │   ├── checkout.test.js
    │   ├── telemetry.test.js
    │   ├── bridge.test.js
    │   └── index.js
    ├── tier2_boundaries/          # Tier 2: Boundary & Corner Cases (31 tests)
    │   ├── auth_boundary.test.js
    │   ├── catalog_boundary.test.js
    │   ├── cart_boundary.test.js
    │   ├── checkout_boundary.test.js
    │   ├── telemetry_boundary.test.js
    │   ├── bridge_boundary.test.js
    │   └── index.js
    ├── tier3_combinations/        # Tier 3: Cross-Feature Combinations (8 tests)
    │   ├── auth_catalog.test.js
    │   ├── catalog_cart.test.js
    │   ├── cart_coupon_checkout.test.js
    │   ├── auth_cart_checkout.test.js
    │   ├── error_telemetry_bridge.test.js
    │   ├── deadlock_telemetry_kill.test.js
    │   ├── cache_bloat_purge.test.js
    │   ├── lifecycle.test.js
    │   └── index.js
    └── tier4_workloads/           # Tier 4: Real-World Scenarios (6 tests)
        ├── customer_journey.test.js
        ├── flash_sale_concurrency.test.js
        ├── sev3_cache_bloat_scenario.test.js
        ├── sev2_coupon_bug_scenario.test.js
        ├── sev1_db_deadlock_scenario.test.js
        ├── status_recovery_journey.test.js
        └── index.js
```

---

## 4. Test Runner CLI Interface (`runner.js`)

### Basic Execution
```bash
# Execute entire E2E suite (All Tiers 1-4)
node test/e2e/runner.js

# Execute Tier 1 Feature Coverage only
node test/e2e/runner.js --tier=1

# Execute Tier 2 Boundary & Corner Cases only
node test/e2e/runner.js --tier=2

# Execute Tier 3 Cross-Feature Combinations only
node test/e2e/runner.js --tier=3

# Execute Tier 4 Real-World Application Scenarios only
node test/e2e/runner.js --tier=4
```

### CLI Flags & Options
| Flag | Description | Default |
| :--- | :--- | :--- |
| `--tier=<1\|2\|3\|4\|all>` | Select test tier to execute | `all` |
| `-t <tier>` | Short alias for `--tier` | `all` |
| `--live` | Force live server execution (`http://localhost:4000` / `http://localhost:3001`) | Auto-detect |
| `--mock` | Force embedded mock server execution | Auto-detect |
| `--verbose`, `-v` | Display individual test execution lines, timings, and error stacks | `false` |
| `--bail`, `-b` | Halt test execution immediately upon first assertion failure | `false` |
| `--help`, `-h` | Display usage manual | `false` |

### Environment Variables
| Variable | Description | Default |
| :--- | :--- | :--- |
| `QUICKCART_URL` | QuickCart Express backend base URL | `http://localhost:4000` |
| `APPSOLVE_URL` | Appsolve Rails 8.1 API backend base URL | `http://localhost:3001` |
| `QUICKCART_BRIDGE_SECRET` | Secret token for SRE Sandbox Bridge | `quickcart-sre-secret-token` |

---

## 5. Interface Contracts Tested

### 1. QuickCart Auth (`/api/v1/auth/*`)
- `POST /api/v1/auth/register`: `{ email, password, full_name }` -> 201 Created `{ token, user }`
- `POST /api/v1/auth/login`: `{ email, password }` -> 200 OK `{ token, user }`
- `GET /api/v1/auth/me`: `Authorization: Bearer <token>` -> 200 OK `{ user }`

### 2. QuickCart Catalog & Caching (`/api/v1/catalog/*`)
- `GET /api/v1/catalog/products`: query params `category`, `search`, `limit`, `offset` -> 200 OK `{ products, count, cached }`, header `X-Cache: HIT|MISS`
- `GET /api/v1/catalog/products/:id`: -> 200 OK `{ product }` or 404 Not Found
- `GET /api/v1/catalog/categories`: -> 200 OK `{ categories: string[] }`

### 3. QuickCart Cart & Coupons (`/api/v1/cart/*`)
- `GET /api/v1/cart?cart_id=<uuid>`: -> 200 OK `{ items, subtotal, applied_coupon, discount, tax, total }`
- `POST /api/v1/cart/items`: `{ cart_id, product_id, quantity }` -> 200 OK
- `PATCH /api/v1/cart/items/:id`: `{ cart_id, quantity }` -> 200 OK
- `DELETE /api/v1/cart/items/:id?cart_id=<uuid>`: -> 200 OK
- `POST /api/v1/cart/coupon`: `{ cart_id, coupon_code }` -> 200 OK or 400 Bad Request

### 4. QuickCart Checkout Locking (`/api/v1/checkout`)
- `POST /api/v1/checkout`: `{ cart_id, shipping_address, payment_method }`
  - Normal operation: 200 OK `{ order_uuid, status: 'paid', total }`
  - Deadlock state: 504 Gateway Timeout `{ error: 'DB_LOCK_TIMEOUT', telemetry_forwarded: true }`

### 5. Remote SRE Sandbox Bridge (`/api/bridge/v1/exec`)
- `POST /api/bridge/v1/exec`: `Authorization: Bearer quickcart-sre-secret-token`
  - Commands: `inspect_db_locks`, `kill_db_locks`, `inspect_cache`, `purge_cache`, `sync_source`, `health_check`
  - Rejection: 401 Unauthorized for missing/bad tokens; 403 Forbidden for path traversal attempts (`../../`)

### 6. Appsolve Telemetry Ingestion (`/api/v1/telemetry/signals`)
- `POST /api/v1/telemetry/signals`: `{ service_slug, error_code, message, severity, raw_payload }`
  - Returns 201 Created with `{ status: 'accepted', incident: { id, incident_code, severity, autonomy_mode } }`
  - Enforces guardrail mapping: `sev3` -> `full_autonomy`, `sev2` -> `approval_required`, `sev1` -> `manual_command_only`

### 7. Appsolve Public Status API (`/api/v1/services`)
- `GET /api/v1/services`: Returns `{ system_status: 'all_operational' | 'partial_outage' | 'major_outage', services: [...] }`

---

## 6. Exit Codes & CI Guarantees
- **Exit Code 0**: All executed test suites and individual assertions passed successfully.
- **Exit Code 1**: One or more assertions failed or an unhandled fatal error occurred.
- Compatible with GitHub Actions, Jenkins, GitLab CI, and Docker container healthchecks.
