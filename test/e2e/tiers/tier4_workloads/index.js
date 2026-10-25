/**
 * Tier 4: Real-World Application Scenarios Aggregator
 * Runs all Tier 4 workload tests across customer journeys, concurrency, and SEV-1/2/3 chaos scenarios.
 */

const { registerCustomerJourneyTests } = require('./customer_journey.test');
const { registerFlashSaleConcurrencyTests } = require('./flash_sale_concurrency.test');
const { registerSev3CacheBloatScenarioTests } = require('./sev3_cache_bloat_scenario.test');
const { registerSev2CouponBugScenarioTests } = require('./sev2_coupon_bug_scenario.test');
const { registerSev1DbDeadlockScenarioTests } = require('./sev1_db_deadlock_scenario.test');
const { registerStatusRecoveryJourneyTests } = require('./status_recovery_journey.test');

function registerTier4Tests() {
  registerCustomerJourneyTests();
  registerFlashSaleConcurrencyTests();
  registerSev3CacheBloatScenarioTests();
  registerSev2CouponBugScenarioTests();
  registerSev1DbDeadlockScenarioTests();
  registerStatusRecoveryJourneyTests();
}

module.exports = { registerTier4Tests };
