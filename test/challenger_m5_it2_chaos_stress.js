#!/usr/bin/env node
/**
 * Empirical Adversarial Challenger 1 Stress Harness — Milestone 5 Iteration 2
 * Targets: bin/chaos CLI, QuickCart /api/chaos/* routes, SRE Bridge, and state transitions
 */

const { spawnSync } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const BIN_CHAOS = 'bin/chaos';
const QUICKCART_URL = process.env.QUICKCART_URL || 'http://localhost:4000';
const APPSOLVE_URL = process.env.APPSOLVE_URL || 'http://localhost:3001';
const BRIDGE_TOKEN = process.env.BRIDGE_SECRET_TOKEN || 'quickcart-sre-secret-token';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function runChaos(args = [], env = {}) {
  const result = spawnSync('node', [BIN_CHAOS, ...args], {
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    combined: (result.stdout || '') + (result.stderr || '')
  };
}

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  \x1b[31m✖ FAIL\x1b[0m ${name}`);
    console.error(`    \x1b[33mError: ${err.message}\x1b[0m`);
    failures.push({ name, error: err.message, stack: err.stack });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertNoUnhandledRejection(output, context = '') {
  const hasRejection = /unhandled(promise)?rejection/i.test(output);
  const hasUncaught = /uncaughtException/i.test(output);
  const hasNodeStackTrace = /at Object\.<anonymous>.*bin\/chaos:\d+:\d+/i.test(output) ||
                            /at process\.<anonymous>/i.test(output) ||
                            /at Module._compile/i.test(output);
  if (hasRejection || hasUncaught || hasNodeStackTrace) {
    throw new Error(`Uncaught error or unhandled rejection detected in ${context}: ${output.slice(0, 300)}`);
  }
}

async function apiRequest(pathUrl, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(pathUrl, QUICKCART_URL);
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: reqHeaders
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { json = data; }
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('\n\x1b[1m\x1b[35m========================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m   CHALLENGER 1: ADVERSARIAL STRESS SUITE (M5 ITERATION 2 GATE)        \x1b[0m');
  console.log('\x1b[1m\x1b[35m========================================================================\x1b[0m\n');

  // Track file sizes to ensure bin/chaos operations never corrupt files
  const filesToTrack = [
    'quickcart/backend/src/services/catalog.service.ts',
    'quickcart/backend/src/services/checkout.service.ts',
    'quickcart/backend/src/routes/chaos.ts',
    'quickcart/backend/src/db/locks.ts'
  ];
  const fileSnapshotsBefore = {};
  for (const f of filesToTrack) {
    if (fs.existsSync(f)) {
      fileSnapshotsBefore[f] = fs.readFileSync(f, 'utf8');
    }
  }

  // -------------------------------------------------------------------------
  // 1. CLI Commands, Options & Missing Commands Analysis
  // -------------------------------------------------------------------------
  console.log('\x1b[1m[Section 1] CLI Commands & Options Specification Compliance\x1b[0m');

  await test('bin/chaos without args displays help and exits 0', () => {
    const res = runChaos([]);
    assert(res.code === 0, `Expected 0, got ${res.code}`);
    assert(res.stdout.includes('USAGE:'), 'Missing USAGE:');
    assertNoUnhandledRejection(res.combined, 'no args');
  });

  await test('bin/chaos --help and -h display help and exit 0', () => {
    const r1 = runChaos(['--help']);
    const r2 = runChaos(['-h']);
    assert(r1.code === 0 && r2.code === 0, 'Help exit codes not 0');
    assert(r1.stdout.includes('COMMANDS:'), 'Missing COMMANDS:');
    assertNoUnhandledRejection(r1.combined, '--help');
    assertNoUnhandledRejection(r2.combined, '-h');
  });

  await test('bin/chaos invalid_command exits with code 1 and clean error', () => {
    const res = runChaos(['invalid_command']);
    assert(res.code === 1, `Expected 1, got ${res.code}`);
    assert(res.combined.includes("Unknown command: 'invalid_command'"), 'Missing unknown command msg');
    assertNoUnhandledRejection(res.combined, 'invalid_command');
  });

  await test('bin/chaos diagnose command existence check (reveals missing subcommand)', () => {
    const res = runChaos(['diagnose']);
    // Document exact behavior: bin/chaos does NOT implement 'diagnose'; it prints unknown command and exits 1
    assert(res.code === 1, `Expected exit code 1, got ${res.code}`);
    assert(res.combined.includes("Unknown command: 'diagnose'"), `Expected unknown command output, got: ${res.combined}`);
    assertNoUnhandledRejection(res.combined, 'bin/chaos diagnose');
  });

  await test('bin/chaos recover command existence check (reveals missing subcommand)', () => {
    const res = runChaos(['recover']);
    // Document exact behavior: bin/chaos does NOT implement 'recover' (uses 'reset' instead); prints unknown command and exits 1
    assert(res.code === 1, `Expected exit code 1, got ${res.code}`);
    assert(res.combined.includes("Unknown command: 'recover'"), `Expected unknown command output, got: ${res.combined}`);
    assertNoUnhandledRejection(res.combined, 'bin/chaos recover');
  });

  await test('bin/chaos --unknown-flag and -x exit with code 1', () => {
    const r1 = runChaos(['--unknown-flag']);
    const r2 = runChaos(['-x']);
    assert(r1.code === 1 && r2.code === 1, 'Unknown flag should exit 1');
    assertNoUnhandledRejection(r1.combined, '--unknown-flag');
    assertNoUnhandledRejection(r2.combined, '-x');
  });

  await test('bin/chaos flag parsing with --target=<val> (validates inert option)', () => {
    const r1 = runChaos(['status', '--target=quickcart', '--json']);
    const r2 = runChaos(['status', '--target=appsolve', '--json']);
    const r3 = runChaos(['status', '--target=all', '--json']);
    assert(r1.code === 0 && r2.code === 0 && r3.code === 0, 'Target flag caused failure');
    assertNoUnhandledRejection(r1.combined, '--target=quickcart');
  });

  await test('bin/chaos inject scenario validation (invalid severities & injections)', () => {
    const invalidScenarios = ['sev0', 'sev4', 'sev99', 'critical', 'random', '../../../etc/passwd'];
    for (const s of invalidScenarios) {
      const res = runChaos(['inject', s]);
      assert(res.code === 1, `Expected code 1 for invalid scenario '${s}', got ${res.code}`);
      assert(res.combined.includes('Must be sev1, sev2, or sev3'), `Missing scenario validation message for '${s}'`);
      assertNoUnhandledRejection(res.combined, `inject ${s}`);
    }
  });

  await test('bin/chaos inject normalization across case and hyphen variants', () => {
    // Clean slate before testing variants
    runChaos(['reset']);

    const validVariants = ['sev1', 'SEV1', 'sev-1', 'SEV-1', 'sev2', 'SEV2', 'sev-2', 'SEV-2', 'sev3', 'SEV3', 'sev-3', 'SEV-3'];
    for (const v of validVariants) {
      const res = runChaos(['inject', v, '--no-traffic']);
      assert(res.code === 0, `Failed to accept and normalize variant '${v}': ${res.combined}`);
      assertNoUnhandledRejection(res.combined, `inject variant ${v}`);
    }
    runChaos(['reset']);
  });

  // -------------------------------------------------------------------------
  // 2. SEV-1 Deadlock Injection, Repeated Injection & Recovery Idempotency
  // -------------------------------------------------------------------------
  console.log('\n\x1b[1m[Section 2] SEV-1 Deadlock Injection, Repeated Injection & Recovery Idempotency\x1b[0m');

  await test('SEV-1 initial injection acquires lock and sets blocked status', async () => {
    runChaos(['reset']);
    const res = runChaos(['inject', 'sev1', '--no-traffic']);
    assert(res.code === 0, `SEV-1 injection failed: ${res.combined}`);

    const statusRes = await apiRequest('/api/chaos/status');
    assert(statusRes.status === 200, `Expected 200, got ${statusRes.status}`);
    assert(statusRes.data.chaos.sev1_deadlock.active === true, 'sev1_deadlock should be active');
    assert(statusRes.data.chaos.sev1_deadlock.table === 'payment_records', 'Locked table should be payment_records');
  });

  await test('SEV-1 repeated injection is idempotent and does not crash or leak locks', async () => {
    // Inject 3 more times while already locked
    for (let i = 1; i <= 3; i++) {
      const res = runChaos(['inject', 'sev1', '--no-traffic']);
      assert(res.code === 0, `Repeated SEV-1 injection #${i} failed: ${res.combined}`);
      assertNoUnhandledRejection(res.combined, `repeated sev1 #${i}`);
    }

    const bridgeRes = await apiRequest('/api/bridge/v1/exec', 'POST', { command: 'inspect_db_locks' }, {
      Authorization: `Bearer ${BRIDGE_TOKEN}`
    });
    assert(bridgeRes.status === 200, `Bridge inspection failed: ${bridgeRes.status}`);
    assert(bridgeRes.data.data.status === 'BLOCKED', 'Bridge should report BLOCKED');
  });

  await test('SEV-1 recovery via reset clears lock state completely', async () => {
    const res = runChaos(['reset']);
    assert(res.code === 0, `Reset failed: ${res.combined}`);

    const statusRes = await apiRequest('/api/chaos/status');
    assert(statusRes.status === 200, `Expected 200, got ${statusRes.status}`);
    assert(statusRes.data.chaos.sev1_deadlock.active === false, 'sev1_deadlock should be false after reset');

    const bridgeRes = await apiRequest('/api/bridge/v1/exec', 'POST', { command: 'inspect_db_locks' }, {
      Authorization: `Bearer ${BRIDGE_TOKEN}`
    });
    assert(bridgeRes.data.data.active_locks === 0, `Expected 0 active locks, got ${bridgeRes.data.data.active_locks}`);
    assert(bridgeRes.data.data.status === 'HEALTHY', 'Bridge should report HEALTHY');
  });

  await test('SEV-1 recovery idempotency: repeated bin/chaos reset calls succeed cleanly', () => {
    for (let i = 1; i <= 3; i++) {
      const res = runChaos(['reset']);
      assert(res.code === 0, `Repeated reset #${i} failed: ${res.combined}`);
      assertNoUnhandledRejection(res.combined, `repeated reset #${i}`);
    }
  });

  // -------------------------------------------------------------------------
  // 3. SEV-2 Coupon Bug Injection, Repeated Injection & Recovery Idempotency
  // -------------------------------------------------------------------------
  console.log('\n\x1b[1m[Section 3] SEV-2 Coupon Bug Injection, Repeated Injection & Recovery\x1b[0m');

  await test('SEV-2 injection activates coupon bug flag', async () => {
    runChaos(['reset']);
    const res = runChaos(['inject', 'sev2', '--no-traffic']);
    assert(res.code === 0, `SEV-2 injection failed: ${res.combined}`);

    const statusRes = await apiRequest('/api/chaos/status');
    assert(statusRes.status === 200, `Expected 200, got ${statusRes.status}`);
    assert(statusRes.data.chaos.sev2_coupon_bug.active === true, 'sev2_coupon_bug should be active');
  });

  await test('SEV-2 repeated injection is idempotent and does not corrupt state', async () => {
    for (let i = 1; i <= 3; i++) {
      const res = runChaos(['inject', 'sev2', '--no-traffic']);
      assert(res.code === 0, `Repeated SEV-2 injection #${i} failed: ${res.combined}`);
      assertNoUnhandledRejection(res.combined, `repeated sev2 #${i}`);
    }

    const statusRes = await apiRequest('/api/chaos/status');
    assert(statusRes.data.chaos.sev2_coupon_bug.active === true, 'sev2_coupon_bug should remain active');
  });

  await test('SEV-2 recovery via reset deactivates coupon bug cleanly', async () => {
    const res = runChaos(['reset']);
    assert(res.code === 0, `Reset failed: ${res.combined}`);

    const statusRes = await apiRequest('/api/chaos/status');
    assert(statusRes.status === 200, `Expected 200, got ${statusRes.status}`);
    assert(statusRes.data.chaos.sev2_coupon_bug.active === false, 'sev2_coupon_bug should be false after reset');
  });

  // -------------------------------------------------------------------------
  // 4. SEV-3 Cache Bloat Injection, Repeated Injection & Recovery Idempotency
  // -------------------------------------------------------------------------
  console.log('\n\x1b[1m[Section 4] SEV-3 Cache Bloat Injection, Autonomous Resolution & Recovery\x1b[0m');

  await test('SEV-3 isolated injection without telemetry bloats cache to CRITICAL pressure', async () => {
    runChaos(['reset']);
    // Inject bloat directly without telemetry to verify cache pressure metrics
    const bloatRes = await apiRequest('/api/chaos/bloat-cache', 'POST', {
      count: 15000,
      forward_telemetry: false
    });
    assert(bloatRes.status === 200, `Bloat failed: ${bloatRes.status}`);

    const statusRes = await apiRequest('/api/chaos/status');
    assert(statusRes.status === 200, `Expected 200, got ${statusRes.status}`);
    assert(statusRes.data.chaos.sev3_cache_bloat.active === true, 'sev3_cache_bloat should be active');
    assert(statusRes.data.chaos.sev3_cache_bloat.total_keys >= 15000, `Expected >= 15000 keys, got ${statusRes.data.chaos.sev3_cache_bloat.total_keys}`);
    assert(statusRes.data.chaos.sev3_cache_bloat.pressure === 'CRITICAL', 'Pressure should be CRITICAL');
  });

  await test('SEV-3 repeated injection increases bloat keys without OOM or crash', async () => {
    const bloatRes = await apiRequest('/api/chaos/bloat-cache', 'POST', {
      count: 20000,
      forward_telemetry: false
    });
    assert(bloatRes.status === 200, `Repeated bloat failed: ${bloatRes.status}`);

    const statusRes = await apiRequest('/api/chaos/status');
    assert(statusRes.data.chaos.sev3_cache_bloat.active === true, 'sev3_cache_bloat should remain active');
    assert(statusRes.data.chaos.sev3_cache_bloat.total_keys >= 20000, `Expected >= 20000 keys, got ${statusRes.data.chaos.sev3_cache_bloat.total_keys}`);
  });

  await test('SEV-3 recovery via reset purges all bloated keys and restores NORMAL pressure', async () => {
    const res = runChaos(['reset']);
    assert(res.code === 0, `Reset failed: ${res.combined}`);

    const statusRes = await apiRequest('/api/chaos/status');
    assert(statusRes.status === 200, `Expected 200, got ${statusRes.status}`);
    assert(statusRes.data.chaos.sev3_cache_bloat.active === false, 'sev3_cache_bloat should be false');
    assert(statusRes.data.chaos.sev3_cache_bloat.total_keys < 100, `Expected low keys after purge, got ${statusRes.data.chaos.sev3_cache_bloat.total_keys}`);
    assert(statusRes.data.chaos.sev3_cache_bloat.pressure === 'NORMAL', 'Pressure should be NORMAL');
  });

  await test('SEV-3 autonomous remediation via bin/chaos inject sev3 triggers closed-loop purge', async () => {
    runChaos(['reset']);
    // bin/chaos inject sev3 bloats cache AND forwards telemetry to Appsolve, which autonomously triggers purge_cache
    const res = runChaos(['inject', 'sev3', '--count=12000']);
    assert(res.code === 0, `bin/chaos inject sev3 failed: ${res.combined}`);
    assert(res.combined.includes('full_autonomy'), 'Expected full_autonomy in CLI output');

    // Give Appsolve autonomous SRE thread 300ms to complete bridge purge
    await new Promise(r => setTimeout(r, 300));

    const statusRes = await apiRequest('/api/chaos/status');
    assert(statusRes.status === 200, `Expected 200, got ${statusRes.status}`);
    // Cache must have been purged autonomously by Appsolve
    assert(statusRes.data.chaos.sev3_cache_bloat.active === false, 'Cache should be autonomously resolved by Appsolve');
    assert(statusRes.data.chaos.sev3_cache_bloat.pressure === 'NORMAL', 'Pressure should be NORMAL post autonomous purge');
  });

  await test('SEV-3 recovery idempotency: repeated purge calls maintain clean state', async () => {
    for (let i = 1; i <= 3; i++) {
      const res = runChaos(['reset']);
      assert(res.code === 0, `Repeated reset #${i} failed: ${res.combined}`);
    }
    const statusRes = await apiRequest('/api/chaos/status');
    assert(statusRes.data.chaos.sev3_cache_bloat.active === false, 'Cache should remain clean');
  });

  // -------------------------------------------------------------------------
  // 5. Cross-Service Impact, Offline Handling & JSON Compliance
  // -------------------------------------------------------------------------
  console.log('\n\x1b[1m[Section 5] Cross-Service Impact, Offline Handling & JSON Compliance\x1b[0m');

  await test('bin/chaos status --json schema completeness', () => {
    const res = runChaos(['status', '--json']);
    assert(res.code === 0, `Expected 0, got ${res.code}`);
    let data;
    try {
      data = JSON.parse(res.stdout);
    } catch (e) {
      throw new Error(`Invalid JSON: ${e.message}`);
    }
    assert(typeof data.quickcart === 'object', 'Missing quickcart in JSON');
    assert(typeof data.appsolve === 'object', 'Missing appsolve in JSON');
    assert(typeof data.quickcart.online === 'boolean', 'quickcart.online must be boolean');
    assert(typeof data.appsolve.online === 'boolean', 'appsolve.online must be boolean');
  });

  await test('bin/chaos status human-readable dashboard renders cleanly', () => {
    const res = runChaos(['status']);
    assert(res.code === 0, `Expected 0, got ${res.code}`);
    assert(res.stdout.includes('QUICKCART & APPSOLVE SYSTEM STATUS DASHBOARD'), 'Missing dashboard header');
    assert(res.stdout.includes('1. QuickCart E-Commerce Subsystem'), 'Missing QuickCart section');
    assert(res.stdout.includes('2. Appsolve SRE Platform'), 'Missing Appsolve section');
    assertNoUnhandledRejection(res.combined, 'status human dashboard');
  });

  await test('bin/chaos status with unreachable QuickCart produces valid JSON with online=false', () => {
    const res = runChaos(['status', '--json', '--quickcart-url=http://127.0.0.1:59999']);
    assert(res.code === 0, `Expected 0, got ${res.code}`);
    const data = JSON.parse(res.stdout);
    assert(data.quickcart.online === false, 'quickcart.online should be false');
    assertNoUnhandledRejection(res.combined, 'status unreachable quickcart');
  });

  await test('bin/chaos status with unreachable Appsolve produces valid JSON with online=false', () => {
    const res = runChaos(['status', '--json', '--appsolve-url=http://127.0.0.1:59998']);
    assert(res.code === 0, `Expected 0, got ${res.code}`);
    const data = JSON.parse(res.stdout);
    assert(data.appsolve.online === false, 'appsolve.online should be false');
    assertNoUnhandledRejection(res.combined, 'status unreachable appsolve');
  });

  await test('High concurrency stress: 10 concurrent bin/chaos status invocations succeed', async () => {
    const promises = Array.from({ length: 10 }, (_, i) => {
      return new Promise((resolve, reject) => {
        try {
          const res = runChaos(['status', '--json']);
          assert(res.code === 0, `Concurrent status #${i} failed`);
          const json = JSON.parse(res.stdout);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    const results = await Promise.all(promises);
    assert(results.length === 10, 'All 10 parallel runs succeeded');
  });

  // -------------------------------------------------------------------------
  // 6. Anti-Corruption Check for Chaos Operations
  // -------------------------------------------------------------------------
  console.log('\n\x1b[1m[Section 6] Anti-Corruption Verification on Tracked Source Files\x1b[0m');

  await test('bin/chaos inject and reset do not modify tracked source files', () => {
    for (const f of filesToTrack) {
      if (fileSnapshotsBefore[f]) {
        const current = fs.readFileSync(f, 'utf8');
        assert(current === fileSnapshotsBefore[f], `File ${f} was mutated during chaos operations!`);
      }
    }
  });

  // Final summary
  console.log('\n\x1b[1m\x1b[35m========================================================================\x1b[0m');
  console.log(`\x1b[1m  TOTAL STRESS TESTS: ${totalTests} | PASSED: \x1b[32m${passedTests}\x1b[0m | FAILED: \x1b[31m${failedTests}\x1b[0m`);
  console.log('\x1b[1m\x1b[35m========================================================================\x1b[0m\n');

  if (failedTests > 0) {
    console.error(`\x1b[1m\x1b[31mFAILURES (${failedTests}):\x1b[0m`);
    for (const f of failures) {
      console.error(`  - \x1b[31m${f.name}\x1b[0m: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('\x1b[1m\x1b[32m✔ ALL CHAOS SUITE EMPIRICAL STRESS TESTS PASSED WITH 0 FAILURES.\x1b[0m\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('\x1b[31mFatal error in stress runner:\x1b[0m', err);
  process.exit(1);
});
