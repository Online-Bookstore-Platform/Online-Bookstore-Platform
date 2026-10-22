'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toCents, fromCents, lineTotal, sum } = require('../utils/money');

describe('money', () => {
  it('converts to and from whole paise', () => {
    assert.equal(toCents(299), 29900);
    assert.equal(toCents(19.99), 1999);
    assert.equal(toCents(0.07), 7);
    assert.equal(fromCents(1999), 19.99);
  });

  it('adds without floating-point drift', () => {
    assert.notEqual(0.1 + 0.2, 0.3); // the problem being avoided
    assert.equal(sum([0.1, 0.2]), 0.3);
    assert.equal(sum([19.99, 19.99, 19.99]), 59.97);
    assert.equal(sum([]), 0);
  });

  it('multiplies price by quantity exactly', () => {
    assert.equal(lineTotal(19.99, 3), 59.97);
    assert.equal(lineTotal(1.1, 3), 3.3); // 1.1 * 3 === 3.3000000000000003
    assert.equal(lineTotal(299, 2), 598);
  });

  it('rejects things that are not money', () => {
    assert.throws(() => toCents('12'), TypeError);
    assert.throws(() => toCents(NaN), TypeError);
    assert.throws(() => fromCents(1.5), TypeError);
  });
});
