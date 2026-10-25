import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, apiRequest, getSignedInUser, loginPath } from './api.js';
import { formatPrice, pluralize, stockLabel } from './format.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const respond = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('no body'); return body; } });

describe('apiRequest', () => {
  it('returns the parsed body and sends JSON with cookies', async () => {
    let seen;
    globalThis.fetch = async (path, options) => ((seen = { path, options }), respond(200, { ok: true })());
    assert.deepEqual(await apiRequest('/api/x', { method: 'PUT', body: { a: 1 }, headers: { 'Idempotency-Key': 'stable-key' } }), { ok: true });
    assert.equal(seen.options.method, 'PUT');
    assert.equal(seen.options.credentials, 'same-origin');
    assert.equal(seen.options.body, '{"a":1}');
    assert.equal(seen.options.headers['Content-Type'], 'application/json');
    assert.equal(seen.options.headers['Idempotency-Key'], 'stable-key');
  });

  it('turns an error body into an ApiError with the backend message and details', async () => {
    globalThis.fetch = respond(400, { error: { code: 'VALIDATION_ERROR', message: 'Bad input.', details: [{ field: 'city', message: 'City is required.' }] } });
    await assert.rejects(apiRequest('/api/x'), error => {
      assert.ok(error instanceof ApiError);
      assert.deepEqual([error.status, error.code, error.message, error.details], [400, 'VALIDATION_ERROR', 'Bad input.', [{ field: 'city', message: 'City is required.' }]]);
      return true;
    });
  });

  it('gives a friendly message when the server answers without JSON (e.g. the dev proxy cannot reach the backend)', async () => {
    globalThis.fetch = respond(500);
    await assert.rejects(apiRequest('/api/x'), error => error.status === 500 && /went wrong/.test(error.message));
    globalThis.fetch = respond(503);
    await assert.rejects(apiRequest('/api/x'), error => /isn’t available/.test(error.message));
  });

  it('reports a network failure as status 0, but lets an abort through untouched', async () => {
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(apiRequest('/api/x'), error => error.status === 0 && error.code === 'NETWORK_ERROR' && /connection/.test(error.message));
    globalThis.fetch = async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); };
    await assert.rejects(apiRequest('/api/x'), error => error.name === 'AbortError');
  });

  it('treats 204 as no content', async () => {
    globalThis.fetch = async () => ({ status: 204, ok: true });
    assert.equal(await apiRequest('/api/x', { method: 'DELETE' }), null);
  });
});

describe('getSignedInUser', () => {
  it('returns the user, or null when signed out, and rethrows other failures', async () => {
    globalThis.fetch = respond(200, { user: { id: 2, role: 'customer' } });
    assert.deepEqual(await getSignedInUser(), { id: 2, role: 'customer' });
    globalThis.fetch = respond(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
    assert.equal(await getSignedInUser(), null);
    globalThis.fetch = respond(503, { error: { code: 'DEPENDENCY_NOT_CONFIGURED', message: 'No database.' } });
    await assert.rejects(getSignedInUser(), error => error.status === 503);
  });

  it('builds a login link that returns to the page', () => {
    assert.equal(loginPath('/checkout'), '/login?next=%2Fcheckout');
  });
});

describe('formatting', () => {
  it('formats rupee prices and survives missing prices', () => {
    assert.match(formatPrice(299), /₹\s?299\.00/);
    assert.match(formatPrice(1299.5), /₹\s?1,299\.50/);
    assert.equal(formatPrice(undefined), 'Price unavailable');
    assert.equal(formatPrice('299'), 'Price unavailable');
  });

  it('labels stock and pluralizes', () => {
    assert.equal(stockLabel('low_stock'), 'Only a few left');
    assert.equal(stockLabel('weird'), 'Availability unknown');
    assert.equal(pluralize(1, 'copy', 'copies'), '1 copy');
    assert.equal(pluralize(0, 'copy', 'copies'), '0 copies');
  });
});
