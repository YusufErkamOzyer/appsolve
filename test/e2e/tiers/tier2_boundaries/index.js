/**
 * Tier 2: Boundary & Corner Cases Aggregator
 * Runs all Tier 2 boundary tests across Auth, Catalog, Cart, Checkout, Telemetry, and SRE Bridge.
 */

const { registerAuthBoundaryTests } = require('./auth_boundary.test');
const { registerCatalogBoundaryTests } = require('./catalog_boundary.test');
const { registerCartBoundaryTests } = require('./cart_boundary.test');
const { registerCheckoutBoundaryTests } = require('./checkout_boundary.test');
const { registerTelemetryBoundaryTests } = require('./telemetry_boundary.test');
const { registerBridgeBoundaryTests } = require('./bridge_boundary.test');

function registerTier2Tests() {
  registerAuthBoundaryTests();
  registerCatalogBoundaryTests();
  registerCartBoundaryTests();
  registerCheckoutBoundaryTests();
  registerTelemetryBoundaryTests();
  registerBridgeBoundaryTests();
}

module.exports = { registerTier2Tests };
