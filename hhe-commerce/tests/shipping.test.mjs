import test from 'node:test';
import assert from 'node:assert/strict';
import { combineProviderQuotes } from '../dist/commerce/shipping.js';

test('mixed-provider shipping adds provider costs and uses slowest package ETA',()=>{
 const options=combineProviderQuotes([
  {provider:'spreadconnect',options:[{provider:'spreadconnect',id:'sc-e',name:'Economy',price:650,currency:'usd',minDays:4,maxDays:7,tierHint:'economy'},{provider:'spreadconnect',id:'sc-x',name:'Express',price:1500,currency:'usd',minDays:1,maxDays:2,tierHint:'express'}]},
  {provider:'kunaki',options:[{provider:'kunaki',id:'k-e',name:'Media Mail',price:500,currency:'usd',minDays:5,maxDays:9,tierHint:'economy'},{provider:'kunaki',id:'k-x',name:'Priority',price:900,currency:'usd',minDays:2,maxDays:4,tierHint:'standard'}]}
 ],'usd');
 const economy=options.find(o=>o.id==='economy');assert.equal(economy.actualProviderCost,1150);assert.equal(economy.price,1150);assert.equal(economy.maxDays,9);
});

test('duplicate tiers collapse when providers expose one method',()=>{const options=combineProviderQuotes([{provider:'kunaki',options:[{provider:'kunaki',id:'only',name:'Only',price:500,currency:'usd'}]}],'usd');assert.equal(options.length,1);});
