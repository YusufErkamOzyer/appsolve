#!/usr/bin/env node
/**
 * Opaque-Box E2E Test Runner for QuickCart & Appsolve Platform
 * Executes 4-tier test methodology:
 *   Tier 1: Feature Coverage (>=5 tests per feature across Auth, Catalog, Cart, Checkout, Telemetry, SRE Bridge)
 *   Tier 2: Boundary & Corner Cases (empty states, invalid coupons, zero/negative amounts, lock contention, token expiration)
 *   Tier 3: Cross-Feature Combinations (pairwise interactions, system loops, shopping lifecycle)
 *   Tier 4: Real-World Application Scenarios (customer journeys, flash sale concurrency, SEV-1/2/3 chaos scenarios)
 *
 * Usage:
 *   node test/e2e/runner.js                 # Run all tiers
 *   node test/e2e/runner.js --tier=1        # Run Tier 1 only
 *   node test/e2e/runner.js --tier=2        # Run Tier 2 only
 *   node test/e2e/runner.js --tier=3        # Run Tier 3 only
 *   node test/e2e/runner.js --tier=4        # Run Tier 4 only
 *   node test/e2e/runner.js --live          # Force testing against live backend servers
 *   node test/e2e/runner.js --mock          # Force testing against embedded mock server
 *   node test/e2e/runner.js --verbose       # Show verbose step details
 */

const { runSuites, state } = require('./lib/harness');
const { client } = require('./lib/client');
const { MockServerInstance } = require('./lib/mock-server');

const { registerTier1Tests } = require('./tiers/tier1_features');
const { registerTier2Tests } = require('./tiers/tier2_boundaries');
const { registerTier3Tests } = require('./tiers/tier3_combinations');
const { registerTier4Tests } = require('./tiers/tier4_workloads');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    tier: 'all',
    live: false,
    mock: false,
    verbose: false,
    bail: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--tier=')) {
      options.tier = arg.split('=')[1].toLowerCase();
    } else if (arg === '-t' && i + 1 < args.length) {
      options.tier = args[++i].toLowerCase();
    } else if (arg === '--live') {
      options.live = true;
    } else if (arg === '--mock') {
      options.mock = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--bail' || arg === '-b') {
      options.bail = true;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
\x1b[1m\x1b[36mQuickCart & Appsolve Opaque-Box E2E Test Runner\x1b[0m

\x1b[1mUSAGE:\x1b[0m
  node test/e2e/runner.js [options]

\x1b[1mOPTIONS:\x1b[0m
  --tier=<1|2|3|4|all>   Execute specific test tier (default: all)
  -t <1|2|3|4|all>       Short form for --tier
  --live                 Force connecting to live servers (QuickCart :4000, Appsolve :3001)
  --mock                 Force starting and executing against embedded contract mock server
  --verbose, -v          Display detailed step-by-step test execution
  --bail, -b             Exit immediately on first test failure
  --help, -h             Display this help message

\x1b[1mTIERS:\x1b[0m
  Tier 1: Feature Coverage (Auth, Catalog caching, Cart discounts, Checkout locking, Telemetry, SRE Bridge)
  Tier 2: Boundary & Corner Cases (empty states, invalid coupons, zero/negative amounts, lock contention, token expiration)
  Tier 3: Cross-Feature Combinations (pairwise interactions, complete shopping lifecycle, system loops)
  Tier 4: Real-World Application Scenarios (customer journeys, flash sale concurrency, SEV-1/2/3 incidents)
`);
}

async function isServerUp(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res.status < 500;
  } catch (e) {
    return false;
  }
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  console.log('\x1b[1m\x1b[35m' + '='.repeat(70) + '\x1b[0m');
  console.log('\x1b[1m\x1b[36m  QuickCart & Appsolve E2E Verification Suite (4-Tier Architecture)\x1b[0m');
  console.log('\x1b[1m\x1b[35m' + '='.repeat(70) + '\x1b[0m');

  let mockInstance = null;
  const quickcartUrl = process.env.QUICKCART_URL || 'http://localhost:4000';
  const appsolveUrl = process.env.APPSOLVE_URL || 'http://localhost:3001';

  // Check target server mode
  let useLive = options.live;
  if (!options.mock && !options.live) {
    const liveAvailable = await isServerUp(`${quickcartUrl}/api/v1/catalog/products`);
    if (liveAvailable) {
      console.log(`\x1b[32m✔ Detected live QuickCart backend at ${quickcartUrl}\x1b[0m`);
      useLive = true;
    } else {
      console.log(`\x1b[33mℹ Live QuickCart backend not reachable at ${quickcartUrl} -> Booting embedded contract mock server\x1b[0m`);
      useLive = false;
    }
  } else if (options.mock) {
    console.log(`\x1b[34mℹ Mock mode forced via --mock\x1b[0m`);
    useLive = false;
  } else {
    console.log(`\x1b[34mℹ Live mode forced via --live\x1b[0m`);
  }

  if (!useLive) {
    mockInstance = new MockServerInstance(4000, { appsolvePort: 3001 });
    await mockInstance.start();
    client.setQuickcartUrl(`http://127.0.0.1:${mockInstance.port}`);
    client.setAppsolveUrl(`http://127.0.0.1:${mockInstance.appsolvePort}`);
    console.log(`\x1b[32m✔ Embedded Mock Servers started on QuickCart :${mockInstance.port} and Appsolve :${mockInstance.appsolvePort}\x1b[0m`);
  } else {
    client.setQuickcartUrl(quickcartUrl);
    client.setAppsolveUrl(appsolveUrl);
    console.log(`\x1b[32m✔ Testing against Live Endpoints: QuickCart=${quickcartUrl}, Appsolve=${appsolveUrl}\x1b[0m`);
  }

  // Register requested tiers
  const tier = options.tier;
  console.log(`\x1b[90mTarget: Tier ${tier.toUpperCase()} | Verbose: ${options.verbose} | Bail: ${options.bail}\x1b[0m\n`);

  state.reset();

  if (tier === '1' || tier === 'all') {
    registerTier1Tests();
  }
  if (tier === '2' || tier === 'all') {
    registerTier2Tests();
  }
  if (tier === '3' || tier === 'all') {
    registerTier3Tests();
  }
  if (tier === '4' || tier === 'all') {
    registerTier4Tests();
  }

  // Run test suites
  let results;
  try {
    results = await runSuites({
      verbose: options.verbose,
      bail: options.bail
    });
  } finally {
    if (mockInstance) {
      await mockInstance.stop();
    }
  }

  // Print Summary Report
  console.log('\n\x1b[1m\x1b[35m' + '-'.repeat(70) + '\x1b[0m');
  console.log('\x1b[1m\x1b[37m  TEST EXECUTION SUMMARY\x1b[0m');
  console.log('\x1b[1m\x1b[35m' + '-'.repeat(70) + '\x1b[0m');

  for (const suite of results.suites) {
    const icon = suite.failed === 0 ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✖\x1b[0m';
    const statusText = suite.failed === 0
      ? `\x1b[32m${suite.passed} passed\x1b[0m`
      : `\x1b[31m${suite.failed} failed\x1b[0m, \x1b[32m${suite.passed} passed\x1b[0m`;
    console.log(`  ${icon} ${suite.name.padEnd(52)} ${statusText} \x1b[90m(${suite.durationMs}ms)\x1b[0m`);
  }

  console.log('\x1b[1m\x1b[35m' + '-'.repeat(70) + '\x1b[0m');
  console.log(`  Total Suites:   \x1b[1m${results.suites.length}\x1b[0m`);
  console.log(`  Total Tests:    \x1b[1m${results.total}\x1b[0m`);
  console.log(`  Passed Tests:   \x1b[1m\x1b[32m${results.passed}\x1b[0m`);
  console.log(`  Failed Tests:   \x1b[1m${results.failed > 0 ? '\x1b[31m' : '\x1b[32m'}${results.failed}\x1b[0m`);
  console.log(`  Total Duration: \x1b[1m${results.durationMs}ms\x1b[0m`);
  console.log('\x1b[1m\x1b[35m' + '='.repeat(70) + '\x1b[0m');

  if (results.failed === 0) {
    console.log(`\n\x1b[1m\x1b[32m🎉 ALL TESTS PASSED SUCCESSFULLY! (Exit Code 0)\x1b[0m\n`);
    process.exit(0);
  } else {
    console.error(`\n\x1b[1m\x1b[31m❌ TEST SUITE FAILED WITH ${results.failed} FAILURE(S) (Exit Code 1)\x1b[0m\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\x1b[31mFatal error during E2E test execution:\x1b[0m', err);
  process.exit(1);
});
