import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPresentationStoreEnvironment, generatedPresentationPrice, presentationStoreEnabled, resolvePresentationProduct } from '../../src/features/uditi/catalogue/presentation-store.js';

test('presentation mode is explicitly opt-in and price generation is stable and bounded', () => {
  assert.equal(presentationStoreEnabled({}), false);
  assert.equal(presentationStoreEnabled({ CATALOGUE_DEMO_MODE: 'true' }), true);
  const env = { CATALOGUE_DEMO_PRICE_MIN: '199', CATALOGUE_DEMO_PRICE_MAX: '999' };
  const one = generatedPresentationPrice('openlibrary:works/OL123W', env);
  assert.equal(generatedPresentationPrice('openlibrary:works/OL123W', env), one);
  assert.ok(one >= 199 && one <= 999);
  assert.notEqual(generatedPresentationPrice('googlebooks:volume-x', env), one);
});

test('production refuses generated presentation products', () => {
  assert.doesNotThrow(() => assertPresentationStoreEnvironment({ NODE_ENV: 'production', CATALOGUE_DEMO_MODE: 'false' }));
  assert.throws(() => assertPresentationStoreEnvironment({ NODE_ENV: 'production', CATALOGUE_DEMO_MODE: 'true' }), /cannot be enabled/);
});

function retryPool(deadlocksBeforeSuccess) {
  let insertAttempts = 0;
  let rollbacks = 0;
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() { rollbacks += 1; }, release() {},
    async query(sql) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('presentation_products')) return [[], []];
      if (sql.includes('books WHERE')) return [[], []];
      if (sql.includes('INSERT IGNORE INTO categories')) return [{ affectedRows: 1 }, []];
      if (sql.includes('SELECT id FROM categories')) return [[{ id: 1 }], []];
      if (sql.includes('INSERT INTO books')) {
        insertAttempts += 1;
        if (insertAttempts <= deadlocksBeforeSuccess) { const error = new Error('deadlock'); error.code = 'ER_LOCK_DEADLOCK'; error.errno = 1213; throw error; }
        return [{ insertId: 9 }, []];
      }
      if (sql.includes('INSERT IGNORE INTO inventory')) return [{ affectedRows: 1 }, []];
      if (sql.includes('INSERT INTO presentation_products')) return [{ affectedRows: 1 }, []];
      return [[{}], []];
    },
  };
  return { pool: { async getConnection() { return connection; } }, attempts: () => insertAttempts, rollbacks: () => rollbacks };
}

test('presentation resolution rolls back and retries a transient deadlock as a whole transaction', async () => {
  const db = retryPool(1);
  const id = await resolvePresentationProduct(db.pool, { provider: 'googlebooks', providerId: 'retry-volume', title: 'Retry book', category: 'Fiction' }, { CATALOGUE_DEMO_MODE: 'true' });
  assert.equal(id, 9);
  assert.equal(db.attempts(), 2);
  assert.equal(db.rollbacks(), 1);
});

test('presentation resolution stops after three attempts when deadlocks persist', async () => {
  const db = retryPool(5);
  await assert.rejects(resolvePresentationProduct(db.pool, { provider: 'googlebooks', providerId: 'stuck-volume', title: 'Stuck book', category: 'Fiction' }, { CATALOGUE_DEMO_MODE: 'true' }), error => error.code === 'ER_LOCK_DEADLOCK');
  assert.equal(db.attempts(), 3);
  assert.equal(db.rollbacks(), 3);
});
