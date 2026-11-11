import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, databaseTests } from '../uditi/helpers.js';
import { createMySqlPasswordResetRepository } from '../../src/features/varchas/authentication/mysql-password-reset.repository.js';
import { hashPassword, verifyPassword } from '../../src/features/varchas/authentication/password.js';

describe('MySQL password reset persistence', databaseTests, () => {
  let database;
  let repository;
  before(async () => {
    database = await createTestDatabase();
    repository = createMySqlPasswordResetRepository(database.pool);
  });
  after(async () => { await database?.drop(); });

  it('expires OTPs, limits attempts, replaces verified codes with a reset proof and revokes sessions', async () => {
    const suffix = randomUUID();
    const oldHash = await hashPassword('old-password-123');
    const newHash = await hashPassword('new-password-456');
    const [owner] = await database.pool.query("INSERT INTO users (name, email, password_hash, terms_accepted_at) VALUES ('Reset Reader', ?, ?, UTC_TIMESTAMP())", [`reset-${suffix}@example.com`, oldHash]);
    const [other] = await database.pool.query("INSERT INTO users (name, email, password_hash, terms_accepted_at) VALUES ('Other Reader', ?, ?, UTC_TIMESTAMP())", [`other-${suffix}@example.com`, oldHash]);
    const userId = owner.insertId;
    const otherId = other.insertId;
    const expired = 'a'.repeat(64);
    const valid = 'b'.repeat(64);
    const sibling = 'c'.repeat(64);

    await repository.savePasswordReset(userId, expired, new Date(Date.now() - 60_000));
    assert.equal(await repository.savePasswordReset(userId, 'f'.repeat(64), new Date(Date.now() + 5 * 60_000)), false, 'resend cooldown refuses an immediate replacement');
    await database.pool.query('UPDATE password_reset_tokens SET created_at = UTC_TIMESTAMP() - INTERVAL 2 MINUTE WHERE user_id = ?', [userId]);
    await repository.savePasswordReset(userId, valid, new Date(Date.now() + 30 * 60_000));
    await database.pool.query('UPDATE password_reset_tokens SET created_at = UTC_TIMESTAMP() - INTERVAL 2 MINUTE WHERE user_id = ?', [userId]);
    await repository.savePasswordReset(userId, sibling, new Date(Date.now() + 30 * 60_000));
    assert.equal(await repository.consumePasswordReset(expired, newHash), false);

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    await database.pool.query('INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)', [
      `reset-numeric-${suffix}`, expiry, JSON.stringify({ userId }),
      `reset-string-${suffix}`, expiry, JSON.stringify({ userId: String(userId) }),
      `reset-other-${suffix}`, expiry, JSON.stringify({ userId: String(otherId) }),
    ]);

    assert.equal(await repository.consumePasswordReset(valid, newHash), false, 'issuing a replacement invalidates the previous credential');
    const proofHash = 'd'.repeat(64);
    assert.equal(await repository.verifyPasswordResetOtp(`reset-${suffix}@example.com`, '0'.repeat(64), proofHash, new Date(Date.now() + 10 * 60_000)), false);
    assert.equal(await repository.verifyPasswordResetOtp(`reset-${suffix}@example.com`, sibling, proofHash, new Date(Date.now() + 10 * 60_000)), true);
    assert.equal(await repository.consumePasswordReset(proofHash, newHash), true);
    assert.equal(await repository.consumePasswordReset(proofHash, newHash), false);

    const [[updatedUser]] = await database.pool.query('SELECT password_hash AS passwordHash FROM users WHERE id = ?', [userId]);
    assert.equal(await verifyPassword('new-password-456', updatedUser.passwordHash), true);
    assert.equal(await verifyPassword('old-password-123', updatedUser.passwordHash), false);
    const [tokens] = await database.pool.query('SELECT used_at AS usedAt FROM password_reset_tokens WHERE user_id = ?', [userId]);
    assert.equal(tokens.length, 3);
    assert.ok(tokens.every(token => token.usedAt));
    const [sessions] = await database.pool.query('SELECT session_id AS sessionId FROM sessions WHERE session_id LIKE ?', [`reset-%-${suffix}`]);
    assert.deepEqual(sessions.map(session => session.sessionId), [`reset-other-${suffix}`]);
  });
});
