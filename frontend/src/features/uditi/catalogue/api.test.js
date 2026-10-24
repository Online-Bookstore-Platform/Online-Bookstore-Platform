import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../shared/api.js';
import { addToCart, friendlyCartError, isPurchasable } from './api.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('add to cart', () => {
  it('allows cart use only for a complete local INR product record', () => {
    const book = { storeProduct: { id: 7, price: 249, currency: 'INR', stockStatus: 'low_stock', available: true } };
    assert.equal(isPurchasable(book), true);
    assert.equal(isPurchasable({}), false);
    assert.equal(isPurchasable({ storeProduct: { ...book.storeProduct, id: '7' } }), false);
    assert.equal(isPurchasable({ storeProduct: { ...book.storeProduct, currency: 'USD' } }), false);
    assert.equal(isPurchasable({ storeProduct: { ...book.storeProduct, available: undefined } }), false);
  });

  it('posts one copy of the book to the cart API (not a local cart)', async () => {
    let seen;
    globalThis.fetch = async (path, options) => ((seen = { path, options }), { status: 201, ok: true, json: async () => ({}) });
    await addToCart(7);
    assert.equal(seen.path, '/api/cart/items');
    assert.equal(seen.options.method, 'POST');
    assert.deepEqual(JSON.parse(seen.options.body), { bookId: 7, quantity: 1 });
  });

  it('explains what to do when signed out, or when the cart service is not connected', () => {
    assert.equal(friendlyCartError(new ApiError(401, 'UNAUTHENTICATED', 'x')).message, 'Sign in to add books to your cart.');
    assert.equal(friendlyCartError(new ApiError(404, 'NOT_FOUND', 'Endpoint not found.')).message, 'The cart isn’t available yet. Please try again later.');
    assert.equal(friendlyCartError(new ApiError(503, 'DEPENDENCY_NOT_CONFIGURED', 'x')).message, 'The cart isn’t available yet. Please try again later.');
  });

  it('keeps the cart’s own message for other problems (e.g. not enough stock)', () => {
    const own = new ApiError(409, 'INSUFFICIENT_STOCK', 'Only 2 copies are available.');
    assert.equal(friendlyCartError(own), own);
    const network = new ApiError(0, 'NETWORK_ERROR', 'We couldn’t reach the server.');
    assert.equal(friendlyCartError(network).message, 'We couldn’t reach the server.');
  });

  it('never reports success when the request fails', async () => {
    globalThis.fetch = async () => ({ status: 404, ok: false, json: async () => ({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }) });
    await assert.rejects(addToCart(1), error => error.status === 404);
  });
});
