import test from 'node:test';
import assert from 'node:assert/strict';
import { combineProviderQuotes } from '../dist/commerce/shipping.js';

test('mixed-provider quotes sum shipping and use slowest delivery window', () => {
  const options = combineProviderQuotes([
    { provider: 'spreadconnect', options: [
      { provider: 'spreadconnect', id: 's1', name: 'Standard', price: 749, currency: 'usd', minDays: 3, maxDays: 7, tierHint: 'economy' },
      { provider: 'spreadconnect', id: 's2', name: 'Express', price: 1499, currency: 'usd', minDays: 1, maxDays: 2, tierHint: 'express' }
    ] },
    { provider: 'kunaki', options: [
      { provider: 'kunaki', id: 'k1', name: 'USPS First Class', price: 500, currency: 'usd', minDays: 2, maxDays: 5, tierHint: 'economy' },
      { provider: 'kunaki', id: 'k2', name: 'UPS Next Day Air', price: 2200, currency: 'usd', minDays: 1, maxDays: 1, tierHint: 'express' }
    ] }
  ], 'usd');
  assert.equal(options[0].price, 1249);
  assert.equal(options[0].maxDays, 7);
  assert.equal(options.at(-1).price, 3699);
  assert.equal(options.at(-1).maxDays, 2);
});

test('duplicate HHE tiers are collapsed when providers expose one method', () => {
  const options = combineProviderQuotes([{ provider: 'kunaki', options: [{ provider: 'kunaki', id: 'only', name: 'Mail', price: 500, currency: 'usd' }] }], 'usd');
  assert.equal(options.length, 1);
});
