/**
 * Opaque-Box E2E Test Harness
 * Zero-dependency test framework providing describe, it, hooks, and assertions.
 */

const assert = require('node:assert');

class TestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
    this.beforeAllHooks = [];
    this.afterAllHooks = [];
    this.beforeEachHooks = [];
    this.afterEachHooks = [];
  }

  addTest(name, fn) {
    this.tests.push({ name, fn, status: 'pending', error: null, durationMs: 0 });
  }

  addBeforeAll(fn) {
    this.beforeAllHooks.push(fn);
  }

  addAfterAll(fn) {
    this.afterAllHooks.push(fn);
  }

  addBeforeEach(fn) {
    this.beforeEachHooks.push(fn);
  }

  addAfterEach(fn) {
    this.afterEachHooks.push(fn);
  }
}

class TestRunnerState {
  constructor() {
    this.suites = [];
    this.currentSuite = null;
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.skippedTests = 0;
    this.startTime = 0;
    this.endTime = 0;
  }

  reset() {
    this.suites = [];
    this.currentSuite = null;
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
    this.skippedTests = 0;
    this.startTime = 0;
    this.endTime = 0;
  }
}

const state = new TestRunnerState();

function describe(suiteName, fn) {
  const suite = new TestSuite(suiteName);
  state.suites.push(suite);
  const previousSuite = state.currentSuite;
  state.currentSuite = suite;
  try {
    fn();
  } finally {
    state.currentSuite = previousSuite;
  }
}

function it(testName, fn) {
  if (!state.currentSuite) {
    throw new Error(`Test "${testName}" must be defined inside a describe() block`);
  }
  state.currentSuite.addTest(testName, fn);
  state.totalTests++;
}

function beforeAll(fn) {
  if (state.currentSuite) {
    state.currentSuite.addBeforeAll(fn);
  }
}

function afterAll(fn) {
  if (state.currentSuite) {
    state.currentSuite.addAfterAll(fn);
  }
}

function beforeEach(fn) {
  if (state.currentSuite) {
    state.currentSuite.addBeforeEach(fn);
  }
}

function afterEach(fn) {
  if (state.currentSuite) {
    state.currentSuite.addAfterEach(fn);
  }
}

async function runSuites(options = {}) {
  const verbose = options.verbose || false;
  const bail = options.bail || false;
  state.startTime = Date.now();
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    suites: [],
    durationMs: 0
  };

  for (const suite of state.suites) {
    const suiteResult = {
      name: suite.name,
      tests: [],
      passed: 0,
      failed: 0,
      durationMs: 0
    };
    const suiteStart = Date.now();

    if (verbose) {
      console.log(`\n  \x1b[1m\x1b[36m▶ Suite: ${suite.name}\x1b[0m`);
    }

    // Run beforeAll hooks
    try {
      for (const hook of suite.beforeAllHooks) {
        await hook();
      }
    } catch (err) {
      console.error(`  \x1b[31m✖ Error in beforeAll for suite "${suite.name}":\x1b[0m`, err.message);
      for (const test of suite.tests) {
        test.status = 'failed';
        test.error = err;
        suiteResult.failed++;
        results.failed++;
      }
      suiteResult.durationMs = Date.now() - suiteStart;
      results.suites.push(suiteResult);
      if (bail) break;
      continue;
    }

    for (const test of suite.tests) {
      results.total++;
      const testStart = Date.now();

      try {
        // Run beforeEach hooks
        for (const hook of suite.beforeEachHooks) {
          await hook();
        }

        // Execute test
        await test.fn();

        // Run afterEach hooks
        for (const hook of suite.afterEachHooks) {
          await hook();
        }

        test.status = 'passed';
        test.durationMs = Date.now() - testStart;
        suiteResult.passed++;
        results.passed++;

        if (verbose) {
          console.log(`    \x1b[32m✔\x1b[0m ${test.name} \x1b[90m(${test.durationMs}ms)\x1b[0m`);
        }
      } catch (err) {
        test.status = 'failed';
        test.error = err;
        test.durationMs = Date.now() - testStart;
        suiteResult.failed++;
        results.failed++;

        console.log(`    \x1b[31m✖\x1b[0m ${test.name} \x1b[90m(${test.durationMs}ms)\x1b[0m`);
        console.log(`      \x1b[31mAssertionError: ${err.message}\x1b[0m`);
        if (err.stack && verbose) {
          const lines = err.stack.split('\n').slice(1, 4).join('\n');
          console.log(`      \x1b[90m${lines}\x1b[0m`);
        }

        if (bail) break;
      }

      suiteResult.tests.push({
        name: test.name,
        status: test.status,
        durationMs: test.durationMs,
        error: test.error ? test.error.message : null
      });
    }

    // Run afterAll hooks
    try {
      for (const hook of suite.afterAllHooks) {
        await hook();
      }
    } catch (err) {
      console.error(`  \x1b[31m✖ Error in afterAll for suite "${suite.name}":\x1b[0m`, err.message);
    }

    suiteResult.durationMs = Date.now() - suiteStart;
    results.suites.push(suiteResult);
    if (bail && suiteResult.failed > 0) break;
  }

  results.durationMs = Date.now() - state.startTime;
  return results;
}

// Clean expect assertion wrapper
const expect = (actual) => ({
  toBe(expected) {
    assert.strictEqual(actual, expected, `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  },
  toEqual(expected) {
    assert.deepStrictEqual(actual, expected, `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  },
  toBeTruthy() {
    assert.ok(actual, `Expected value to be truthy, got ${JSON.stringify(actual)}`);
  },
  toBeFalsy() {
    assert.ok(!actual, `Expected value to be falsy, got ${JSON.stringify(actual)}`);
  },
  toBeGreaterThan(expected) {
    assert.ok(actual > expected, `Expected ${actual} to be greater than ${expected}`);
  },
  toBeGreaterThanOrEqual(expected) {
    assert.ok(actual >= expected, `Expected ${actual} to be >= ${expected}`);
  },
  toBeLessThan(expected) {
    assert.ok(actual < expected, `Expected ${actual} to be less than ${expected}`);
  },
  toBeLessThanOrEqual(expected) {
    assert.ok(actual <= expected, `Expected ${actual} to be <= ${expected}`);
  },
  toContain(item) {
    if (typeof actual === 'string' || Array.isArray(actual)) {
      assert.ok(actual.includes(item), `Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`);
    } else {
      assert.ok(item in actual, `Expected object to contain property ${item}`);
    }
  },
  toMatch(pattern) {
    assert.match(String(actual), pattern, `Expected "${actual}" to match pattern ${pattern}`);
  },
  toBeDefined() {
    assert.notStrictEqual(actual, undefined, `Expected value to be defined`);
  },
  toBeUndefined() {
    assert.strictEqual(actual, undefined, `Expected value to be undefined`);
  },
  toBeNull() {
    assert.strictEqual(actual, null, `Expected value to be null`);
  }
});

module.exports = {
  describe,
  it,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  runSuites,
  state,
  assert,
  expect
};
