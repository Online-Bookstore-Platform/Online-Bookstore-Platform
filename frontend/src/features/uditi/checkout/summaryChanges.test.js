import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { describeSummaryChanges, stockProblems } from './summaryChanges.js';
import { ORDER_SERVICE_UNAVAILABLE, createOrderDraft, orderServiceProblem, paymentPath } from './api.js';
import { ApiError } from '../shared/api.js';

const line = (bookId, overrides = {}) => ({ bookId, title: `Book ${bookId}`, unitPrice: 100, quantity: 1, lineTotal: 100, available: true, problem: null, ...overrides });
const summary = (...items) => ({ items, totals: { subtotal: 0, total: 0, currency: 'INR' } });

describe('describeSummaryChanges', () => {
  it('reports nothing when nothing changed', () => {
    assert.deepEqual(describeSummaryChanges(summary(line(1), line(2)), summary(line(1), line(2))), { changed: false, messages: [] });
  });

  it('reports a price change with the old and new price', () => {
    const { changed, messages } = describeSummaryChanges(summary(line(1)), summary(line(1, { unitPrice: 149.5 })));
    assert.equal(changed, true);
    assert.match(messages[0], /“Book 1” now costs ₹\s?149\.50 \(it was ₹\s?100\.00\)\./);
  });

  it('reports stock problems, removed books and quantity changes', () => {
    const before = summary(line(1), line(2), line(3));
    const after = summary(line(1, { problem: 'Only 1 copy of “Book 1” is available, but you chose 1.' }), line(3, { quantity: 4 }));
    const { messages } = describeSummaryChanges(before, after);
    assert.ok(messages.includes('Only 1 copy of “Book 1” is available, but you chose 1.'));
    assert.ok(messages.includes('The quantity of “Book 3” changed to 4.'));
    assert.ok(messages.includes('“Book 2” is no longer in your cart.'));
  });

  it('reports books added elsewhere and an emptied cart', () => {
    assert.deepEqual(describeSummaryChanges(summary(line(1)), summary(line(1), line(2))).messages, ['“Book 2” was added to your cart.']);
    assert.deepEqual(describeSummaryChanges(summary(line(1)), summary()).messages, ['“Book 1” is no longer in your cart.', 'Your cart is empty.']);
  });

  it('lists the lines that block checkout', () => {
    assert.deepEqual(stockProblems(summary(line(1), line(2, { problem: '“Book 2” is out of stock.' }))), [{ bookId: 2, message: '“Book 2” is out of stock.' }]);
  });
});

describe('order-draft hand-off', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const answer = (status, body) => async () => ({ status, ok: status < 300, json: async () => body });

  it('returns the order the order service created and builds the payment link from its id', async () => {
    let sent;
    globalThis.fetch = async (path, options) => ((sent = { path, options }), answer(201, { order: { id: 42, orderNumber: 'ORD-000042' } })());
    const order = await createOrderDraft({ city: 'Pune' });
    assert.equal(sent.path, '/api/orders');
    assert.deepEqual(JSON.parse(sent.options.body), { delivery: { city: 'Pune' } });
    assert.equal(paymentPath(order), '/payment?orderId=42');
    assert.equal(paymentPath({ id: 'a b' }), '/payment?orderId=a%20b');
  });

  it('reports a missing order service honestly instead of pretending an order exists', async () => {
    globalThis.fetch = answer(404, { error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
    await assert.rejects(createOrderDraft({}), error => error.code === ORDER_SERVICE_UNAVAILABLE && /isn’t connected yet/.test(error.message));
    globalThis.fetch = answer(503, { error: { code: 'DEPENDENCY_NOT_CONFIGURED', message: 'x' } });
    await assert.rejects(createOrderDraft({}), error => error.code === ORDER_SERVICE_UNAVAILABLE);
  });

  it('refuses an answer that carries no order', async () => {
    globalThis.fetch = answer(201, {});
    await assert.rejects(createOrderDraft({}), error => error.code === 'ORDER_INVALID');
  });

  it('passes other problems through unchanged (e.g. the order service says stock ran out)', async () => {
    const own = new ApiError(409, 'INSUFFICIENT_STOCK', 'Only 1 copy left.');
    assert.equal(orderServiceProblem(own), own);
    globalThis.fetch = answer(409, { error: { code: 'INSUFFICIENT_STOCK', message: 'Only 1 copy left.' } });
    await assert.rejects(createOrderDraft({}), error => error.status === 409 && error.message === 'Only 1 copy left.');
  });
});
