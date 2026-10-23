import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeStockUpdate, validateStockChange } from './inventoryRules.js';
import { parseSetStockBody, parseAdjustStockBody } from '../../../../../backend/src/features/uditi/inventory/inventory.validation.js';
import { adjustStock as realAdjust } from '../../../../../backend/src/features/uditi/inventory/inventory.service.js';

const check = (mode, amount, current = 10, reason = '') => validateStockChange({ mode, amount, reason, current });

describe('adding and removing copies', () => {
  it('accepts plain, signed and spaced numbers and shows the stock afterwards', () => {
    assert.deepEqual(check('adjust', '5'), { ok: true, body: { change: 5 }, after: 15 });
    assert.deepEqual(check('adjust', '+5'), { ok: true, body: { change: 5 }, after: 15 });
    assert.deepEqual(check('adjust', ' -4 ', 10, ' Water damage '), { ok: true, body: { change: -4, reason: 'Water damage' }, after: 6 });
    assert.deepEqual(check('adjust', '-10'), { ok: true, body: { change: -10 }, after: 0 });
  });

  it('refuses to go below zero, saying how many copies there are', () => {
    assert.deepEqual(check('adjust', '-11'), { ok: false, field: 'amount', message: 'Stock cannot go below zero: only 10 copies in stock, so 11 cannot be removed.' });
    assert.match(check('adjust', '-2', 1).message, /only 1 copy in stock, so 2 cannot be removed/);
  });

  it('refuses nothing, zero, fractions, words and absurd amounts', () => {
    for (const bad of ['', '  ', '0', '+0', '2.5', 'ten', '1e3', '--2', '5 copies']) assert.equal(check('adjust', bad).ok, false, JSON.stringify(bad));
    assert.equal(check('adjust', '1000001').ok, false);
    assert.equal(check('adjust', '999999', 5).ok, false, 'the stock after would exceed the maximum');
  });
});

describe('setting an exact count', () => {
  it('accepts zero and whole numbers up to the maximum', () => {
    assert.deepEqual(check('set', '0'), { ok: true, body: { quantity: 0 }, after: 0 });
    assert.deepEqual(check('set', '42', 10, 'Annual stock-take'), { ok: true, body: { quantity: 42, reason: 'Annual stock-take' }, after: 42 });
    assert.equal(check('set', '1000000').ok, true);
  });

  it('explains what is wrong', () => {
    assert.equal(check('set', '').message, 'Enter the number of copies on the shelf.');
    assert.equal(check('set', '-1').message, 'Quantity cannot be negative.');
    assert.equal(check('set', '1.5').message, 'Quantity must be a whole number.');
    assert.equal(check('set', 'abc').message, 'Quantity must be a whole number.');
    assert.equal(check('set', '1000001').message, 'Quantity cannot be more than 1,000,000.');
  });
});

describe('reason', () => {
  it('is optional and limited to 200 characters', () => {
    assert.equal(check('set', '5', 10, 'x'.repeat(200)).ok, true);
    assert.deepEqual(check('set', '5', 10, 'x'.repeat(201)), { ok: false, field: 'reason', message: 'The reason is too long (up to 200 characters).' });
  });
});

describe('the browser only sends what the server accepts', () => {
  it('produces bodies that pass the server’s validation, with the same trimming', () => {
    const set = check('set', '42', 10, '  Shelf count ');
    assert.deepEqual(parseSetStockBody(set.body), { quantity: 42, reason: 'Shelf count' });
    const adjust = check('adjust', '-3', 10, 'Damaged');
    assert.deepEqual(parseAdjustStockBody(adjust.body), { change: -3, reason: 'Damaged' });
  });

  it('uses the server’s wording for the below-zero rule', async () => {
    // Fake just enough of a connection for the real service to reach its "below zero" check.
    const connection = {
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
      query: async sql => [/FOR UPDATE/.test(sql) ? [{ quantity: 10 }] : [], undefined],
    };
    const pool = { getConnection: async () => connection };
    await assert.rejects(realAdjust(pool, { bookId: 1, change: -11, adminId: 1 }), error => {
      assert.equal(error.message, check('adjust', '-11').message);
      return true;
    });
  });
});

describe('messages', () => {
  it('describes an update', () => {
    assert.equal(describeStockUpdate('Dracula', 21, 1), 'Stock for “Dracula” is now 1 copy (was 21).');
    assert.equal(describeStockUpdate('Dracula', 1, 0), 'Stock for “Dracula” is now 0 copies (was 1).');
  });
});
