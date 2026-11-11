import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderConfirmationService } from '../../src/features/vrinda/orders/order-confirmation.service.js';
import { createPaymentService } from '../../src/features/varchas/payments/payment.service.js';

const order = { id: 19, orderNumber: 'FOLIO19', email: 'reader@gmail.com', status: 'confirmed', paymentStatus: 'succeeded', items: [] };

function deliveryHarness({ fail = false, missing = false } = {}) {
  const state = { status: missing ? null : 'pending', attempts: 0, sent: 0, committed: false, logs: [] };
  const deliveries = {
    async ensure() { if (state.status === null) state.status = 'pending'; },
    async claim() {
      if (state.status !== 'pending') return false;
      state.status = 'sending'; state.attempts += 1; return true;
    },
    async markSent() { state.status = 'sent'; },
    async markFailed() { state.status = 'pending'; },
  };
  const emailService = { async sendOrderConfirmation({ to, order: messageOrder }) {
    assert.equal(state.committed, true, 'email dispatch occurs only after the order transaction resolves');
    assert.equal(to, 'reader@gmail.com');
    assert.equal(messageOrder.id, order.id);
    state.sent += 1;
    if (fail) throw Object.assign(new Error('SMTP auth failed for reader@gmail.com; code 123456'), { code: 'EAUTH', responseCode: 535, command: 'AUTH PLAIN' });
    return { accepted: [to], rejected: [], messageId: 'safe-message-id' };
  } };
  const logger = { info(...args) { state.logs.push(args); }, error(...args) { state.logs.push(args); } };
  return { state, service: createOrderConfirmationService({ deliveries, emailService, orders: { async get() { return order; } }, logger }) };
}

test('successful payment dispatches confirmation after commit, and duplicate requests do not resend', async () => {
  const fixture = deliveryHarness();
  fixture.state.committed = true;
  const first = await fixture.service.sendForOrder(order);
  const duplicate = await fixture.service.sendForOrder(order);
  assert.deepEqual(first, { sent: true });
  assert.equal(duplicate.sent, false);
  assert.equal(fixture.state.sent, 1);
  assert.equal(fixture.state.status, 'sent');
  const logText = JSON.stringify(fixture.state.logs);
  for (const phrase of ['Order confirmation triggered', 'recipient identified', 'SMTP sending started', 'SMTP accepted']) assert.match(logText, new RegExp(phrase));
  assert.match(logText, /r\*\*\*@g\*\*\*\.com/);
  assert.doesNotMatch(logText, /reader@gmail\.com/);
});

test('a confirmed order without an outbox row is initialized and sent once', async () => {
  const fixture = deliveryHarness({ missing: true });
  fixture.state.committed = true;
  assert.deepEqual(await fixture.service.sendForOrder(order), { sent: true });
  assert.equal(fixture.state.status, 'sent');
  assert.equal(fixture.state.sent, 1);
});

test('delivery failure is queued for retry and does not change paid order state', async () => {
  const fixture = deliveryHarness({ fail: true });
  fixture.state.committed = true;
  const result = await fixture.service.sendForOrder(order);
  assert.deepEqual(result, { sent: false, reason: 'delivery_failed' });
  assert.equal(fixture.state.status, 'pending');
  assert.equal(order.paymentStatus, 'succeeded');
  assert.equal(order.status, 'confirmed');
  const logText = JSON.stringify(fixture.state.logs);
  assert.match(logText, /EAUTH/);
  assert.match(logText, /535/);
  assert.match(logText, /AUTH PLAIN/);
  assert.doesNotMatch(logText, /reader@gmail\.com|123456|SMTP auth failed/);
  fixture.state.sent = 0;
  fixture.service.sendForOrder = async () => ({ sent: true });
  assert.deepEqual(await fixture.service.sendForOrder(order), { sent: true }, 'a safe customer retry can deliver the pending message');
});

function paymentHarness({ verification = { ok: true, paymentMethod: 'card' }, failOrder = false } = {}) {
  const state = { emails: 0, orderCalls: 0, committed: false };
  const otpChallenges = {
    async create({ id }) { state.challengeId = id; return { resendAt: new Date() }; },
    async verify() { return verification; },
  };
  const orders = {
    async validatePaymentCheckout() {},
    async createAfterPaymentOtp({ verifyChallenge }) {
      state.orderCalls += 1;
      if (failOrder) throw new Error('order insert failed');
      const valid = await verifyChallenge();
      if (!valid.ok) return { verification: valid };
      state.committed = true;
      return { order, reused: false };
    },
  };
  const service = createPaymentService({
    orders, payments: { recordSimulatedSuccess: async () => {} }, otpChallenges,
    emailService: { configured: true, async sendPaymentOtp() {} }, secret: 'test-secret',
    orderConfirmationEmails: { async sendForOrder() { assert.equal(state.committed, true); state.emails += 1; return { sent: true }; } },
    logger: { error() {} },
  });
  return { service, state };
}

test('failed OTP and failed order creation never dispatch a confirmation email', async () => {
  const invalid = paymentHarness({ verification: { ok: false, reason: 'incorrect' } });
  const challenge = await invalid.service.requestOtp({ user: { id: 2, email: 'reader@gmail.com' }, paymentMethod: 'card' });
  await assert.rejects(invalid.service.verifyOtp({ userId: 2, challengeId: challenge.challengeId, otp: '123456' }));
  assert.equal(invalid.state.emails, 0);

  const failed = paymentHarness({ failOrder: true });
  const failedChallenge = await failed.service.requestOtp({ user: { id: 2, email: 'reader@gmail.com' }, paymentMethod: 'card' });
  await assert.rejects(failed.service.verifyOtp({ userId: 2, challengeId: failedChallenge.challengeId, otp: '123456' }), /order insert failed/);
  assert.equal(failed.state.emails, 0);
});
