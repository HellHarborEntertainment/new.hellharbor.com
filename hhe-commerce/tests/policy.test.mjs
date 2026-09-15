import test from 'node:test';
import assert from 'node:assert/strict';
import { applyShippingPolicy } from '../dist/commerce/policy.js';
const base=[{id:'economy',name:'HHE Economy',price:1000,actualProviderCost:1000,currency:'usd',providerSelections:{}},{id:'express',name:'HHE Express',price:2000,actualProviderCost:2000,currency:'usd',providerSelections:{}}];
test('shipping policy supports markup and subsidy',()=>{const out=applyShippingPolicy(base,5000,{freeShippingThresholdCents:0,shippingSubsidyCents:100,shippingMarkupBps:1000,minShippingChargeCents:0});assert.equal(out[0].price,1000);assert.equal(out[1].price,2100);});
test('free shipping threshold only zeroes economy tier',()=>{const out=applyShippingPolicy(base,10000,{freeShippingThresholdCents:10000,shippingSubsidyCents:0,shippingMarkupBps:0,minShippingChargeCents:0});assert.equal(out[0].price,0);assert.equal(out[1].price,2000);});
