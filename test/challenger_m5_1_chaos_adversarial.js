#!/usr/bin/env node
/**
 * Adversarial Challenger 1 Stress Testing Suite for Milestone 5
 * Target: bin/chaos CLI and QuickCart /api/chaos/* Injection Endpoints
 */

const { spawnSync, execSync } = require('node:child_process');
const http = require('node:http');

const BIN_CHAOS = 'bin/chaos';
const QUICKCART_URL = process.env.QUICKCART_URL || 'http://localhost:4000';
const APPSOLVE_URL = process.env.APPSOLVE_URL || 'http://localhost:3001';

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

async function apiRequest(path, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const url = new URL(path, QUICKCART_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
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
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runAllTests() {
  console.log('\n\x1b[1m\x1b[35m========================================================================\x1b[0m');
  console.log('\x1b[1m\x1b[36m   CHALLENGER 1: ADVERSARIAL STRESS-TESTING (bin/chaos & CHAOS ROUTES)  \x1b[0m');
  console.log('\x1b[1m\x1b[35m========================================================================\x1b[0m\n');

  // =========================================================================
  // SECTION 1: Invalid CLI Commands & Help Flag Handling
  // =========================================================================
  console.log('\x1b[1m[Section 1] Invalid CLI Commands & Help Handling\x1b[0m');

  await test('bin/chaos without arguments displays help and exits with code 0', () => {
    const res = runChaos([]);
    assert(res.code === 0, `Expected exit code 0, got ${res.code}`);
    assert(res.stdout.includes('USAGE:'), 'Output does not include USAGE:');
    assertNoUnhandledRejection(res.combined, 'bin/chaos with no args');
  });

  await test('bin/chaos --help prints help and exits 0', () => {
    const res = runChaos(['--help']);
    assert(res.code === 0, `Expected code 0, got ${res.code}`);
    assert(res.stdout.includes('COMMANDS:'), 'Missing commands in help');
    assertNoUnhandledRejection(res.combined, '--help');
  });

  await test('bin/chaos -h prints help and exits 0', () => {
    const res = runChaos(['-h']);
    assert(res.code === 0, `Expected code 0, got ${res.code}`);
    assertNoUnhandledRejection(res.combined, '-h');
  });

  await test('bin/chaos invalid_cmd exits with code 1 and prints clean error', () => {
    const res = runChaos(['invalid_cmd']);
    assert(res.code === 1, `Expected exit code 1, got ${res.code}`);
    assert(res.combined.includes("Unknown command: 'invalid_cmd'"), 'Expected unknown command error message');
    assertNoUnhandledRejection(res.combined, 'invalid_cmd');
  });

  await test('bin/chaos "" (empty string command) exits with code 1 without crashing', () => {
    const res = runChaos(['']);
    // Either exits 0 (help) or 1 (unknown command), but must NOT crash with stack trace
    assert(res.code === 0 || res.code === 1, `Unexpected exit code ${res.code}`);
    assertNoUnhandledRejection(res.combined, 'empty string command');
  });

  await test('bin/chaos special characters "!@#$%" exits with code 1', () => {
    const res = runChaos(['!@#$%']);
    assert(res.code === 1, `Expected code 1, got ${res.code}`);
    assertNoUnhandledRejection(res.combined, 'special characters command');
  });

  // =========================================================================
  // SECTION 2: Unknown Flags Handling
  // =========================================================================
  console.log('\n\x1b[1m[Section 2] Unknown Flags Handling\x1b[0m');

  await test('bin/chaos --unknown-flag exits with code 1 and clean error', () => {
    const res = runChaos(['--unknown-flag']);
    assert(res.code === 1, `Expected exit code 1, got ${res.code}`);
    assert(res.combined.includes('--unknown-flag'), 'Should mention the flag');
    assertNoUnhandledRejection(res.combined, '--unknown-flag');
  });

  await test('bin/chaos -x (unknown short flag) exits with code 1 without uncaught error', () => {
    const res = runChaos(['-x']);
    assert(res.code === 1, `Expected exit code 1, got ${res.code}`);
    assertNoUnhandledRejection(res.combined, '-x');
  });

  await test('bin/chaos status --unknown-flag executes or errors cleanly without stack trace', () => {
    const res = runChaos(['status', '--unknown-flag']);
    assertNoUnhandledRejection(res.combined, 'status --unknown-flag');
  });

  await test('bin/chaos reset --unknown-flag executes or errors cleanly without stack trace', () => {
    const res = runChaos(['reset', '--unknown-flag']);
    assertNoUnhandledRejection(res.combined, 'reset --unknown-flag');
  });

  // =========================================================================
  // SECTION 3: Scenario Validation for bin/chaos inject
  // =========================================================================
  console.log('\n\x1b[1m[Section 3] Scenario Validation for bin/chaos inject\x1b[0m');

  await test('bin/chaos inject with no scenario exits with code 1 and helpful error', () => {
    const res = runChaos(['inject']);
    assert(res.code === 1, `Expected exit code 1, got ${res.code}`);
    assert(res.combined.includes('Must be sev1, sev2, or sev3'), 'Expected scenario instruction error');
    assertNoUnhandledRejection(res.combined, 'inject with no scenario');
  });

  await test('bin/chaos inject sev99 exits with code 1 and clean error', () => {
    const res = runChaos(['inject', 'sev99']);
    assert(res.code === 1, `Expected exit code 1, got ${res.code}`);
    assert(res.combined.includes("Invalid scenario 'sev99'"), `Expected invalid scenario message, got: ${res.combined}`);
    assertNoUnhandledRejection(res.combined, 'inject sev99');
  });

  await test('bin/chaos inject sev0 exits with code 1', () => {
    const res = runChaos(['inject', 'sev0']);
    assert(res.code === 1, `Expected exit code 1, got ${res.code}`);
    assertNoUnhandledRejection(res.combined, 'inject sev0');
  });

  await test('bin/chaos inject sev4 exits with code 1', () => {
    const res = runChaos(['inject', 'sev4']);
    assert(res.code === 1, `Expected exit code 1, got ${res.code}`);
    assertNoUnhandledRejection(res.combined, 'inject sev4');
  });

  await test('bin/chaos inject path traversal attempt "../../../etc" exits with code 1', () => {
    const res = runChaos(['inject', '../../../etc']);
    assert(res.code === 1, `Expected exit code 1, got ${res.code}`);
    assertNoUnhandledRejection(res.combined, 'inject path traversal');
  });

  await test('bin/chaos inject SEV1 (uppercase) is accepted and normalized', () => {
    const res = runChaos(['inject', 'SEV1', '--no-traffic']);
    assert(res.code === 0, `Expected exit code 0, got ${res.code}: ${res.combined}`);
    assert(res.combined.includes('SEV-1 INCIDENT INJECTED'), 'Failed to inject SEV1');
    assertNoUnhandledRejection(res.combined, 'inject SEV1');
  });

  await test('bin/chaos inject SEV-2 (hyphenated uppercase) is accepted and normalized', () => {
    const res = runChaos(['inject', 'SEV-2', '--no-traffic']);
    assert(res.code === 0, `Expected exit code 0, got ${res.code}: ${res.combined}`);
    assert(res.combined.includes('SEV-2 INCIDENT INJECTED'), 'Failed to inject SEV-2');
    assertNoUnhandledRejection(res.combined, 'inject SEV-2');
  });

  await test('bin/chaos inject sev-3 (hyphenated lowercase) is accepted and normalized', () => {
    const res = runChaos(['inject', 'sev-3']);
    assert(res.code === 0, `Expected exit code 0, got ${res.code}: ${res.combined}`);
    assert(res.combined.includes('SEV-3 INCIDENT INJECTED'), 'Failed to inject sev-3');
    assertNoUnhandledRejection(res.combined, 'inject sev-3');
  });

  // Cleanup after injection checks
  runChaos(['reset']);

  // =========================================================================
  // SECTION 4: Status JSON Output & Schema Validation
  // =========================================================================
  console.log('\n\x1b[1m[Section 4] Status JSON Output & Schema Validation\x1b[0m');

  await test('bin/chaos status --json produces 100% valid parseable JSON', () => {
    const res = runChaos(['status', '--json']);
    assert(res.code === 0, `Expected exit code 0, got ${res.code}`);
    let parsed;
    try {
      parsed = JSON.parse(res.stdout);
    } catch (e) {
      throw new Error(`JSON.parse failed on status --json: ${e.message}\nOutput: ${res.stdout}`);
    }
    assert(typeof parsed === 'object' && parsed !== null, 'JSON root is not an object');
    assert('quickcart' in parsed, 'Missing quickcart key in status JSON');
    assert('appsolve' in parsed, 'Missing appsolve key in status JSON');
    assert(typeof parsed.quickcart.online === 'boolean', 'quickcart.online must be boolean');
    assert(typeof parsed.appsolve.online === 'boolean', 'appsolve.online must be boolean');
    assertNoUnhandledRejection(res.combined, 'status --json');
  });

  await test('bin/chaos status --json with unreachable QuickCart produces valid JSON and online=false', () => {
    const res = runChaos(['status', '--json', '--quickcart-url=http://127.0.0.1:59999']);
    assert(res.code === 0, `Expected exit code 0, got ${res.code}`);
    let parsed;
    try {
      parsed = JSON.parse(res.stdout);
    } catch (e) {
      throw new Error(`JSON.parse failed when quickcart unreachable: ${e.message}`);
    }
    assert(parsed.quickcart.online === false, 'Expected quickcart.online to be false');
    assertNoUnhandledRejection(res.combined, 'status --json unreachable quickcart');
  });

  await test('bin/chaos status --json with unreachable Appsolve produces valid JSON and online=false', () => {
    const res = runChaos(['status', '--json', '--appsolve-url=http://127.0.0.1:59998']);
    assert(res.code === 0, `Expected exit code 0, got ${res.code}`);
    let parsed;
    try {
      parsed = JSON.parse(res.stdout);
    } catch (e) {
      throw new Error(`JSON.parse failed when appsolve unreachable: ${e.message}`);
    }
    assert(parsed.appsolve.online === false, 'Expected appsolve.online to be false');
    assertNoUnhandledRejection(res.combined, 'status --json unreachable appsolve');
  });

  // =========================================================================
  // SECTION 5: Rapid Back-to-Back Cycling Stress Test
  // =========================================================================
  console.log('\n\x1b[1m[Section 5] Rapid Back-to-Back Cycling Stress Test\x1b[0m');

  await test('Rapid back-to-back cycling: inject sev1 -> inject sev2 -> inject sev3 -> reset -> status', () => {
    const tStart = Date.now();
    
    // 1. Inject sev1
    let r = runChaos(['inject', 'sev1']);
    assert(r.code === 0, `inject sev1 failed: ${r.combined}`);
    assertNoUnhandledRejection(r.combined, 'cycling inject sev1');

    // 2. Inject sev2
    r = runChaos(['inject', 'sev2']);
    assert(r.code === 0, `inject sev2 failed: ${r.combined}`);
    assertNoUnhandledRejection(r.combined, 'cycling inject sev2');

    // 3. Inject sev3
    r = runChaos(['inject', 'sev3']);
    assert(r.code === 0, `inject sev3 failed: ${r.combined}`);
    assertNoUnhandledRejection(r.combined, 'cycling inject sev3');

    // 4. Reset
    r = runChaos(['reset']);
    assert(r.code === 0, `reset failed: ${r.combined}`);
    assertNoUnhandledRejection(r.combined, 'cycling reset');

    // 5. Status
    r = runChaos(['status', '--json']);
    assert(r.code === 0, `status --json failed: ${r.combined}`);
    const status = JSON.parse(r.stdout);
    assert(status.quickcart.online === true, 'QuickCart should be online after reset');
    assert(status.quickcart.locks?.active_locks === 0, 'Locks should be 0 after reset');
    assert(status.quickcart.cache?.bloat_detected === false, 'Cache bloat should be cleared after reset');
    assertNoUnhandledRejection(r.combined, 'cycling status');

    console.log(`    (Completed full cycle in ${Date.now() - tStart}ms)`);
  });

  await test('Tight 3x repeated cycling loop executes deterministically without corruption', () => {
    for (let cycle = 1; cycle <= 3; cycle++) {
      let r = runChaos(['inject', 'sev1', '--no-traffic']);
      assert(r.code === 0, `Cycle ${cycle} inject sev1 failed`);
      r = runChaos(['inject', 'sev2', '--no-traffic']);
      assert(r.code === 0, `Cycle ${cycle} inject sev2 failed`);
      r = runChaos(['inject', 'sev3']);
      assert(r.code === 0, `Cycle ${cycle} inject sev3 failed`);
      r = runChaos(['reset']);
      assert(r.code === 0, `Cycle ${cycle} reset failed`);
    }
    const r = runChaos(['status', '--json']);
    const status = JSON.parse(r.stdout);
    assert(status.quickcart.online === true, 'QuickCart should remain healthy');
    assert(status.quickcart.locks?.active_locks === 0, 'Locks should be zero');
  });

  // =========================================================================
  // SECTION 6: QuickCart Chaos Injection API Edge Cases
  // =========================================================================
  console.log('\n\x1b[1m[Section 6] QuickCart Chaos Injection API Endpoint Edge Cases\x1b[0m');

  await test('GET /api/chaos/status returns status: success and healthy: true initially', async () => {
    await apiRequest('/api/chaos/reset', 'POST', {});
    const res = await apiRequest('/api/chaos/status', 'GET');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.status === 'success', 'Expected status success');
    assert(res.data.healthy === true, 'Expected healthy: true');
  });

  await test('POST /api/chaos/bloat-cache with malformed and boundary count values', async () => {
    // Malformed string count -> defaults gracefully
    let res = await apiRequest('/api/chaos/bloat-cache', 'POST', { count: 'invalid' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    // Count = 0
    res = await apiRequest('/api/chaos/bloat-cache', 'POST', { count: 0 });
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    // Empty body
    res = await apiRequest('/api/chaos/bloat-cache', 'POST');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('POST /api/chaos/lock-checkout with invalid PID', async () => {
    // PID string
    let res = await apiRequest('/api/chaos/lock-checkout', 'POST', { pid: 'not_a_number' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    // Empty body
    res = await apiRequest('/api/chaos/lock-checkout', 'POST');
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    // Cleanup
    await apiRequest('/api/chaos/reset', 'POST', {});
  });

  await test('Severity route aliases respond identically to canonical endpoints', async () => {
    // /api/chaos/inject/sev1 vs /api/chaos/sev1
    let r1 = await apiRequest('/api/chaos/inject/sev1', 'POST', {});
    assert(r1.status === 200 && r1.data.severity === 'sev1', 'Alias /inject/sev1 failed');

    let r2 = await apiRequest('/api/chaos/sev1', 'POST', {});
    assert(r2.status === 200 && r2.data.severity === 'sev1', 'Alias /sev1 failed');

    // /api/chaos/inject/sev2 vs /api/chaos/sev2
    let r3 = await apiRequest('/api/chaos/inject/sev2', 'POST', {});
    assert(r3.status === 200 && r3.data.severity === 'sev2', 'Alias /inject/sev2 failed');

    let r4 = await apiRequest('/api/chaos/sev2', 'POST', {});
    assert(r4.status === 200 && r4.data.severity === 'sev2', 'Alias /sev2 failed');

    // /api/chaos/inject/sev3 vs /api/chaos/sev3
    let r5 = await apiRequest('/api/chaos/inject/sev3', 'POST', { count: 100 });
    assert(r5.status === 200 && r5.data.severity === 'sev3', 'Alias /inject/sev3 failed');

    let r6 = await apiRequest('/api/chaos/sev3', 'POST', { count: 100 });
    assert(r6.status === 200 && r6.data.severity === 'sev3', 'Alias /sev3 failed');

    // Reset after test
    await apiRequest('/api/chaos/reset', 'POST', {});
  });

  await test('GET /api/chaos/status accurately reflects active chaos flags', async () => {
    // Inject sev1
    await apiRequest('/api/chaos/lock-checkout', 'POST', {});
    let res = await apiRequest('/api/chaos/status', 'GET');
    assert(res.data.healthy === false, 'healthy should be false when sev1 is active');
    assert(res.data.chaos.sev1_deadlock.active === true, 'sev1_deadlock should be active');

    // Inject sev2
    await apiRequest('/api/chaos/inject-coupon-bug', 'POST', {});
    res = await apiRequest('/api/chaos/status', 'GET');
    assert(res.data.chaos.sev2_coupon_bug.active === true, 'sev2_coupon_bug should be active');

    // Reset
    await apiRequest('/api/chaos/reset', 'POST', {});
    res = await apiRequest('/api/chaos/status', 'GET');
    assert(res.data.healthy === true, 'healthy should be true after reset');
    assert(res.data.chaos.sev1_deadlock.active === false, 'sev1 should be inactive after reset');
    assert(res.data.chaos.sev2_coupon_bug.active === false, 'sev2 should be inactive after reset');
  });

  // =========================================================================
  // SECTION 7: Comprehensive Synthetic Health Verification
  // =========================================================================
  console.log('\n\x1b[1m[Section 7] Synthetic System Health Verification via bin/chaos verify\x1b[0m');

  await test('bin/chaos verify passes all 7 subsystem health checks with exit code 0', () => {
    const res = runChaos(['verify']);
    assert(res.code === 0, `Expected exit code 0, got ${res.code}: ${res.combined}`);
    assert(res.combined.includes('ALL ACCEPTANCE CHECKS PASSED SUCCESSFULLY'), 'Expected all checks to pass');
    assertNoUnhandledRejection(res.combined, 'bin/chaos verify');
  });

  // =========================================================================
  // SECTION 8: Verification Failure Detection Under Fault Conditions
  // =========================================================================
  console.log('\n\x1b[1m[Section 8] Verification Failure Detection Under Fault Conditions\x1b[0m');

  await test('bin/chaos verify correctly reports failure (exit code 1) when SEV-1 deadlock is active', () => {
    runChaos(['inject', 'sev1', '--no-traffic']);
    const res = runChaos(['verify']);
    assert(res.code === 1, `Expected exit code 1 under SEV-1, got ${res.code}`);
    assert(res.combined.includes('FAIL'), 'Expected FAIL in verify output under SEV-1');
    assertNoUnhandledRejection(res.combined, 'verify under sev1');
    runChaos(['reset']);
  });

  await test('bin/chaos verify correctly reports failure (exit code 1) when SEV-2 coupon bug is active', () => {
    runChaos(['inject', 'sev2', '--no-traffic']);
    const res = runChaos(['verify']);
    assert(res.code === 1, `Expected exit code 1 under SEV-2, got ${res.code}`);
    assert(res.combined.includes('FAIL'), 'Expected FAIL in verify output under SEV-2');
    assertNoUnhandledRejection(res.combined, 'verify under sev2');
    runChaos(['reset']);
  });

  // =========================================================================
  // SECTION 9: Concurrency & Parallel Execution Stress
  // =========================================================================
  console.log('\n\x1b[1m[Section 9] Concurrency & Parallel Execution Stress\x1b[0m');

  await test('5 concurrent parallel executions of bin/chaos status --json produce valid JSON', async () => {
    const promises = Array.from({ length: 5 }, (_, idx) => {
      return new Promise((resolve, reject) => {
        try {
          const res = runChaos(['status', '--json']);
          assert(res.code === 0, `Parallel invocation ${idx} failed with code ${res.code}`);
          const parsed = JSON.parse(res.stdout);
          assert(typeof parsed === 'object', `Parallel invocation ${idx} did not return object`);
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });

    const results = await Promise.all(promises);
    assert(results.length === 5, 'Expected 5 successful parallel parses');
  });

  // =========================================================================
  // Print Final Summary
  // =========================================================================
  console.log('\n\x1b[1m\x1b[35m========================================================================\x1b[0m');
  console.log(`\x1b[1m  TOTAL TESTS: ${totalTests} | PASSED: \x1b[32m${passedTests}\x1b[0m | FAILED: \x1b[31m${failedTests}\x1b[0m`);
  console.log('\x1b[1m\x1b[35m========================================================================\x1b[0m\n');

  if (failedTests > 0) {
    console.error(`\x1b[1m\x1b[31mFAILURES (${failedTests}):\x1b[0m`);
    for (const f of failures) {
      console.error(`  - \x1b[31m${f.name}\x1b[0m: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('\x1b[1m\x1b[32m✔ ALL ADVERSARIAL CHALLENGE TESTS PASSED ZERO FAILURES OR REJECTIONS.\x1b[0m\n');
    process.exit(0);
  }
}

runAllTests().catch(err => {
  console.error('\x1b[31mFatal error in test runner:\x1b[0m', err);
  process.exit(1);
});
