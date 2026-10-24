/**
 * Tier 3: Cross-Feature Combinations Aggregator
 * Runs all Tier 3 combination tests across pairwise interactions, system loops, and shopping lifecycle.
 */

const { registerAuthCatalogTests } = require('./auth_catalog.test');
const { registerCatalogCartTests } = require('./catalog_cart.test');
const { registerCartCouponCheckoutTests } = require('./cart_coupon_checkout.test');
const { registerAuthCartCheckoutTests } = require('./auth_cart_checkout.test');
const { registerErrorTelemetryBridgeTests } = require('./error_telemetry_bridge.test');
const { registerDeadlockTelemetryKillTests } = require('./deadlock_telemetry_kill.test');
const { registerCacheBloatPurgeTests } = require('./cache_bloat_purge.test');
const { registerLifecycleTests } = require('./lifecycle.test');

function registerTier3Tests() {
  registerAuthCatalogTests();
  registerCatalogCartTests();
  registerCartCouponCheckoutTests();
  registerAuthCartCheckoutTests();
  registerErrorTelemetryBridgeTests();
  registerDeadlockTelemetryKillTests();
  registerCacheBloatPurgeTests();
  registerLifecycleTests();
}

module.exports = { registerTier3Tests };
