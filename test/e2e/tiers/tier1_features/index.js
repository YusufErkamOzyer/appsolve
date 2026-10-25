/**
 * Tier 1: Feature Coverage Aggregator
 * Runs all Tier 1 feature coverage tests across Auth, Catalog, Cart, Checkout, Telemetry, and SRE Bridge.
 */

const { registerAuthTests } = require('./auth.test');
const { registerCatalogTests } = require('./catalog.test');
const { registerCartTests } = require('./cart.test');
const { registerCheckoutTests } = require('./checkout.test');
const { registerTelemetryTests } = require('./telemetry.test');
const { registerBridgeTests } = require('./bridge.test');

function registerTier1Tests() {
  registerAuthTests();
  registerCatalogTests();
  registerCartTests();
  registerCheckoutTests();
  registerTelemetryTests();
  registerBridgeTests();
}

module.exports = { registerTier1Tests };
