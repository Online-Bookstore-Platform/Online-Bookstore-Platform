import test from 'node:test';
import assert from 'node:assert/strict';
import { canCustomerCancelOrder } from './orderRules.js';

test('customer cancellation eligibility follows stored order statuses through pre-shipment only', () => {
  for (const status of ['pending', 'pending_collection', 'paid', 'confirmed', 'processing', 'packed']) {
    assert.equal(canCustomerCancelOrder(status), true, `${status} can be cancelled before shipment`);
  }
  for (const status of ['shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned', 'payment_failed']) {
    assert.equal(canCustomerCancelOrder(status), false, `${status} cannot be cancelled by the customer`);
  }
});
