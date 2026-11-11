import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, databaseTests } from '../uditi/helpers.js';
import { createMySqlPaymentOtpRepository } from '../../src/features/varchas/payments/mysql-payment-otp.repository.js';

describe('MySQL simulated payment OTP persistence', databaseTests, () => {
  let database;
  let repository;
  let userId;
  before(async () => {
    database = await createTestDatabase();
    repository = createMySqlPaymentOtpRepository(database.pool);
    const [result] = await database.pool.query(
      "INSERT INTO users (name, email, password_hash, terms_accepted_at) VALUES ('Payment Reader', ?, 'unused', UTC_TIMESTAMP())",
      [`payment-${randomUUID()}@example.com`]
    );
    userId = result.insertId;
  });
  after(async () => { await database?.drop(); });

  it('enforces resend cooldown, wrong-code attempts, expiry, and one-time use', async () => {
    const firstId = randomUUID();
    const first = await repository.create({ id: firstId, userId, paymentMethod: 'upi', otpHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 5 * 60_000) });
    assert.equal(first.id, firstId);
    assert.equal((await repository.create({ id: randomUUID(), userId, paymentMethod: 'card', otpHash: 'b'.repeat(64), expiresAt: new Date(Date.now() + 5 * 60_000) })).cooldown, true);
    assert.deepEqual(await repository.verify({ id: firstId, userId, otpHash: 'c'.repeat(64) }), { ok: false, reason: 'incorrect' });
    const [[attempt]] = await database.pool.query('SELECT otp_attempts AS otpAttempts FROM payment_otp_challenges WHERE id = ?', [firstId]);
    assert.equal(Number(attempt.otpAttempts), 1);

    await database.pool.query('UPDATE payment_otp_challenges SET created_at = UTC_TIMESTAMP() - INTERVAL 2 MINUTE WHERE id = ?', [firstId]);
    const replacementId = randomUUID();
    await repository.create({ id: replacementId, userId, paymentMethod: 'netbanking', otpHash: 'd'.repeat(64), expiresAt: new Date(Date.now() - 1000) });
    assert.deepEqual(await repository.verify({ id: firstId, userId, otpHash: 'a'.repeat(64) }), { ok: false, reason: 'used' });
    assert.deepEqual(await repository.verify({ id: replacementId, userId, otpHash: 'd'.repeat(64) }), { ok: false, reason: 'expired' });

    await database.pool.query('UPDATE payment_otp_challenges SET created_at = UTC_TIMESTAMP() - INTERVAL 2 MINUTE WHERE id = ?', [replacementId]);
    const finalId = randomUUID();
    await repository.create({ id: finalId, userId, paymentMethod: 'card', otpHash: 'e'.repeat(64), expiresAt: new Date(Date.now() + 5 * 60_000) });
    assert.deepEqual(await repository.verify({ id: finalId, userId, otpHash: 'e'.repeat(64) }), { ok: true, paymentMethod: 'card' });
    assert.deepEqual(await repository.verify({ id: finalId, userId, otpHash: 'e'.repeat(64) }), { ok: false, reason: 'used' });
  });
});
