import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFulfillmentStatus, normalizeProviderStatus } from '../dist/commerce/fulfillment.js';
test('delivered maps before shipped',()=>{assert.equal(normalizeProviderStatus('DELIVERED'),'delivered');});
test('cancelled provider is ignored when all remaining groups delivered',()=>{assert.equal(computeFulfillmentStatus(['cancelled','delivered']),'delivered');});
test('mixed shipped and processing becomes partially shipped',()=>{assert.equal(computeFulfillmentStatus(['shipped','processing']),'partially_shipped');});
test('exception remains visible at order level',()=>{assert.equal(computeFulfillmentStatus(['shipped','exception']),'exception');});
