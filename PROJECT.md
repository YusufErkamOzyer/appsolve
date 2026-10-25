# Project: QuickCart E-Commerce & Appsolve SRE Platform

## Architecture
The platform consists of three core subsystems working seamlessly over HTTP/REST and Git automation:

1. **Appsolve Web Platform (`frontend/` & `backend/`)**:
   - **Backend**: Ruby on Rails 8.1 API (port 3001) managing incidents, telemetry signal ingestion, AI triage, guardrails, GitHub automation, and remote SRE bridge dispatch.
   - **Frontend**: Next.js 16 (port 3000) retro workstation UI (`/`) and public status page (`/status`). War Room Action Card displays GitHub branch/PR links, interactive execution controls, live diagnostic output feeds, and unified diff views.

2. **QuickCart E-Commerce Ecosystem (`quickcart/backend/` & `quickcart/mobile/`)**:
   - **Backend**: TypeScript / Express API (port 4000) with SQLite database (`better-sqlite3`). Provides Auth, Catalog with cache, Cart with coupon calculation, and Checkout with row/table transaction locking. Includes error interceptor forwarding structured telemetry to Appsolve, and an authenticated Remote SRE Sandbox Bridge (`/api/bridge/v1/*`) for live diagnostics, lock killing, cache purging, and hot-reload source syncing.
   - **Mobile Client**: Expo React Native application (`quickcart/mobile/`) with Catalog browsing, Cart management with coupons, Checkout flow, and a live `SystemStatusBanner` querying Appsolve's public status API (`GET /api/v1/services`).

3. **Chaos & Verification Engine (`test/e2e/` & `bin/chaos`)**:
   - Independent verification suite and chaos orchestrator driving SEV-1 (DB deadlock), SEV-2 (coupon calculation bug), and SEV-3 (cache bloat) scenarios.

---

## Feature Inventory
Every feature from the Survey phase is mapped to a milestone below:
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | QuickCart Auth & Catalog | User auth endpoints and cached product catalog | M1 | Survey |
| 2 | QuickCart Cart & Coupons | Cart state and coupon discount calculation | M1 | Survey |
| 3 | QuickCart Checkout Locking | Transactional checkout with row-level locks | M1 | Survey |
| 4 | Telemetry Forwarder Middleware | Intercepts unhandled errors and posts structured signals with stack trace to Appsolve | M1 | Survey |
| 5 | Remote SRE Sandbox Bridge | Authenticated bridge for diagnostics, lock killing, cache purging, and source syncing | M1 | Survey |
| 6 | SRE Bridge Client in Rails | Rails client dispatching commands to QuickCart bridge with Bearer auth | M2 | Survey |
| 7 | Git Provider & GitHub Automation | Dual Git Provider (`GithubApiClient` + `LocalGitProvider`) for branch creation, patch commit, PR opening, and PR merge | M2 | Survey |
| 8 | AI SRE Code Repair & Remediation | Automated diff generation, branch/PR creation for SEV-2, remote lock kill for SEV-1, autonomous purge for SEV-3 | M2 | Survey |
| 9 | Action Card Retro Diff Viewer | Embedded syntax-highlighted unified diff viewer in War Room Action Card | M3 | Survey |
| 10| War Room GitHub & Controls | Branch/PR pills, PR merge action, and live diagnostic terminal feed | M3 | Survey |
| 11| QuickCart Mobile Expo App | Expo React Native app with Catalog, Cart, and Checkout screens | M4 | Survey |
| 12| Mobile System Status Banner | Dynamic banner polling Appsolve public status API and recovering gracefully | M4 | Survey |
| 13| Opaque-Box E2E Test Suite | 4-tier requirement-driven test suite (Tiers 1-4) with `TEST_READY.md` | E2E Track | Survey |
| 14| Chaos Injection Runner (`bin/chaos`) | CLI utility for injecting SEV-1, SEV-2, and SEV-3 scenarios | M5 | Survey |
| 15| Automated Acceptance Verification | End-to-end integration test validating all 5 acceptance criteria | M5 | Survey |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | QuickCart Backend & SRE Bridge | Express backend, SQLite DB, Auth, Catalog, Cart, Checkout, Telemetry forwarder, Remote SRE Bridge | none | DONE |
| M2 | Appsolve GitHub & Remote SRE Engine | Rails GitProvider, GitHub API client, LocalGitProvider, SreBridgeClient, PR automation, diff generator | M1 (Bridge contract) | DONE |
| M3 | War Room Action Card & Diff UI | Next.js ActionCard with PR links, UnifiedDiffViewer, interactive merge & diagnostic terminal feed | M2 | DONE |
| M4 | QuickCart Mobile Client | Expo React Native app, shopping flow, SystemStatusBanner polling Appsolve API | M1 | PLANNED |
| M5 | Chaos Testing & E2E Validation | `bin/chaos` runner, chaos suite test, 100% E2E test pass across all acceptance criteria | M1, M2, M3, M4, E2E Track | PLANNED |
| E2E | E2E Testing Track | Independent opaque-box test runner, test cases (Tiers 1-4), `TEST_READY.md` publication | none | DONE |

---

## Interface Contracts

### 1. QuickCart Telemetry Forwarder -> Appsolve Backend
- **Endpoint**: `POST http://localhost:3001/api/v1/telemetry/signals`
- **Headers**: `Content-Type: application/json`
- **Payload**:
  ```json
  {
    "service_slug": "catalog" | "cart" | "checkout" | "auth",
    "error_code": "STRING (e.g. ERR_COUPON_CALCULATION, ERR_DB_LOCK_TIMEOUT, ERR_CACHE_BLOAT)",
    "message": "Human readable error description",
    "severity": "sev1" | "sev2" | "sev3",
    "raw_payload": {
      "stack_trace": "Formatted stack trace string",
      "source_file": "relative/file/path.ts",
      "line_number": 42,
      "context": {}
    }
  }
  ```

### 2. Appsolve SreBridgeClient -> QuickCart SRE Sandbox Bridge
- **Endpoint**: `POST http://localhost:4000/api/bridge/v1/exec`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer quickcart-sre-secret-token`
- **Payload**:
  ```json
  {
    "command": "inspect_db_locks" | "kill_db_locks" | "inspect_cache" | "purge_cache" | "sync_source" | "health_check",
    "params": {
      "target_file": "src/services/cart.service.ts",
      "content": "...",
      "lock_id": 123
    }
  }
  ```
- **Response**:
  ```json
  {
    "status": "success" | "error",
    "command": "...",
    "output": "stdout or summary message",
    "data": {}
  }
  ```

### 3. Appsolve Rails Backend -> Next.js Frontend (`ActionCardPayload`)
- **Fields in `ActionCardPayload`**:
  - `plan_id`: string
  - `title`: string
  - `tool_name`: string
  - `risk_level`: "LOW" | "MEDIUM" | "HIGH"
  - `steps`: string[]
  - `github_branch`: string (optional, e.g. "fix/cart-coupon-nan")
  - `github_branch_url`: string (optional)
  - `github_pr_number`: number (optional, e.g. 104)
  - `github_pr_url`: string (optional)
  - `diff_content`: string (optional, unified diff format)
  - `affected_file`: string (optional, e.g. "quickcart/backend/src/services/cart.service.ts")
  - `merge_status`: "pending" | "merged" | "not_applicable"

### 4. Appsolve Public Status API -> QuickCart Mobile Client
- **Endpoint**: `GET http://localhost:3001/api/v1/services`
- **Response**:
  ```json
  {
    "system_status": "all_operational" | "partial_outage" | "major_outage",
    "active_incident": {
      "id": 1,
      "severity": "sev1" | "sev2" | "sev3",
      "title": "...",
      "status": "investigating" | "identified" | "monitoring" | "resolved"
    },
    "services": [...]
  }
  ```

---

## Code Layout
- `backend/`: Appsolve Rails 8.1 API backend (port 3001)
  - `app/services/ai_sre/git_provider.rb`
  - `app/services/ai_sre/github_api_client.rb`
  - `app/services/ai_sre/local_git_provider.rb`
  - `app/services/ai_sre/sre_bridge_client.rb`
  - `app/services/ai_sre/remediation_service.rb`
  - `test/integration/chaos_suite_test.rb`
- `frontend/`: Appsolve Next.js 16 frontend (port 3000)
  - `src/lib/api.ts`
  - `src/components/workstation/ActionCard.tsx`
  - `src/components/workstation/UnifiedDiffViewer.tsx`
- `quickcart/backend/`: QuickCart Express / SQLite backend (port 4000)
  - `src/db/`: SQLite setup, migrations, seed data
  - `src/routes/`: auth, catalog, cart, checkout, bridge, chaos
  - `src/services/`: auth, catalog, cart, checkout
  - `src/middleware/`: telemetry_forwarder.ts, bridge_auth.ts
  - `src/bridge/`: commands handler, hot reloader
  - `src/server.ts`
- `quickcart/mobile/`: QuickCart Expo React Native mobile client
  - `src/screens/`: CatalogScreen, CartScreen, CheckoutScreen
  - `src/components/`: SystemStatusBanner, ProductCard, CartItem
  - `src/services/`: quickcartApi.ts, appsolveStatusApi.ts
  - `App.tsx`
- `test/e2e/`: Requirement-driven opaque-box test suite
  - `runner.js`: Test runner executing Tiers 1-4
  - `tiers/`: tier1_features, tier2_boundaries, tier3_combinations, tier4_workloads
- `bin/chaos`: Executable chaos testing CLI script
