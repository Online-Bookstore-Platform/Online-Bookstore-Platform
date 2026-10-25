import test from 'node:test';
import assert from 'node:assert/strict';
import { createMySqlBooksRepository } from '../../src/features/varchas/book-details/mysql-books.repository.js';

function fixture({ failInventory = false } = {}) {
  const log = [];
  let id = 41;
  const connection = {
    async beginTransaction() { log.push('begin'); },
    async commit() { log.push('commit'); },
    async rollback() { log.push('rollback'); },
    release() { log.push('release'); },
    async query(sql, values = []) {
      log.push({ sql, values });
      if (sql.startsWith('SELECT id FROM categories')) return [[{ id: 7 }]];
      if (sql.startsWith('SELECT id FROM books')) return [[{ id: 41 }]];
      if (sql.startsWith('INSERT INTO books')) return [{ insertId: id++ }];
      if (sql.startsWith('INSERT INTO inventory') && failInventory) throw new Error('inventory write failed');
      if (sql.startsWith('SELECT b.id')) return [[{ id: 41, title: 'Real title', author: 'Real author', isbn: null, category: 'History', price: 299.5, description: 'Details', coverImageUrl: null, isActive: 1 }]];
      if (sql.startsWith('UPDATE books SET is_active')) return [{ affectedRows: 1 }];
      return [{ affectedRows: 1 }];
    },
  };
  return { log, pool: { ...connection, async getConnection() { return connection; } } };
}

const input = { title: 'Real title', author: 'Real author', isbn: '', openLibraryWorkId: 'works/OL123W', category: 'History', description: 'Details', price: 299.5, coverImageUrl: '' };

test('MySQL books repository transactionally creates persisted book details and zero stock', async () => {
  const { log, pool } = fixture();
  const repo = createMySqlBooksRepository(pool);
  const book = await repo.create(input);
  assert.equal((await repo.list()).length, 1);
  assert.equal(book.id, 41);
  assert.equal(book.price, 299.5);
  assert.equal(book.currency, 'INR');
  const insert = log.find(entry => typeof entry === 'object' && entry.sql.startsWith('INSERT INTO books'));
  assert.deepEqual(insert.values, [null, 'works/OL123W', 'Real title', 'Real author', 7, 299.5, 'Details', null]);
  assert.ok(log.some(entry => typeof entry === 'object' && entry.sql.startsWith('INSERT INTO inventory') && entry.values[0] === 41 && entry.sql.includes('VALUES (?, 0)')));
  assert.ok(log.includes('commit'));
});

test('MySQL books repository rolls back a failed inventory write', async () => {
  const { log, pool } = fixture({ failInventory: true });
  await assert.rejects(createMySqlBooksRepository(pool).create(input), /inventory write failed/);
  assert.ok(log.includes('rollback'));
  assert.ok(!log.includes('commit'));
});

test('book updates and deactivation use parameterized writes and retain the row', async () => {
  const { log, pool } = fixture();
  const repo = createMySqlBooksRepository(pool);
  assert.equal((await repo.update('41', { price: 350 })).price, 299.5);
  assert.equal(await repo.deleteOrDeactivate('41'), true);
  const update = log.find(entry => typeof entry === 'object' && entry.sql.startsWith('UPDATE books SET price'));
  assert.deepEqual(update.values, [350, '41']);
  assert.ok(log.some(entry => typeof entry === 'object' && entry.sql.startsWith('UPDATE books SET is_active = 0')));
  assert.ok(!log.some(entry => typeof entry === 'object' && entry.sql.startsWith('DELETE FROM books')));
});
