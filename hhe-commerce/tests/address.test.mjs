import test from 'node:test';
import assert from 'node:assert/strict';
import { fulfillmentAddressMatches, stripeShippingAddress } from '../dist/lib/address.js';

test('address comparison tolerates case, punctuation, and postal spacing',()=>{
 const quoted={firstName:'Jordin',lastName:'Bryant',address1:'123 Main St.',address2:'# 4',city:'Aberdeen',state:'WA',postalCode:'98520',country:'US'};
 const paid={firstName:'J',lastName:'B',address1:'123 MAIN ST',address2:'4',city:'aberdeen',state:'wa',postalCode:'98520 ',country:'us'};
 assert.equal(fulfillmentAddressMatches(quoted,paid),true);
});

test('address comparison rejects fulfillment-changing postal code',()=>{
 const a={firstName:'A',lastName:'B',address1:'1 Main',city:'Aberdeen',state:'WA',postalCode:'98520',country:'US'};
 assert.equal(fulfillmentAddressMatches(a,{...a,postalCode:'98101'}),false);
});

test('reads modern Stripe collected_information shipping details',()=>{
 const a=stripeShippingAddress({collected_information:{shipping_details:{name:'Jane Doe',address:{line1:'1 Main',city:'Seattle',state:'WA',postal_code:'98101',country:'US'}}}});
 assert.equal(a?.firstName,'Jane');assert.equal(a?.lastName,'Doe');assert.equal(a?.postalCode,'98101');
});
