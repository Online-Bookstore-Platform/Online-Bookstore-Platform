import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderCancellationEmailService } from '../../src/features/vrinda/orders/order-cancellation-email.service.js';
import { createEmailService } from '../../src/features/varchas/authentication/email.service.js';

const order = {
  id: 28, orderNumber: 'FOLIO28', email: 'reader@example.com', customerName: 'A Reader',
  status: 'cancelled', paymentStatus: 'pending_collection', paymentMethod: 'cod',
  createdAt: '2026-11-12T10:00:00.000Z', totalAmount: 42, currency: 'INR',
  items: [{ title: 'The Folio Book', quantity: 2, unitPrice: 21 }],
};

function fixture({ fail = false } = {}) {
  const state = { status: 'pending', sends: 0, committed: false, logs: [] };
  const deliveries = {
    async ensure() {},
    async claim() { if (state.status !== 'pending') return false; state.status = 'sending'; return true; },
    async markSent() { state.status = 'sent'; },
    async markFailed() { state.status = 'pending'; },
  };
  const emailService = { async sendOrderCancellation({ to }) {
    assert.equal(state.committed, true);
    assert.equal(to, order.email);
    state.sends += 1;
    if (fail) throw Object.assign(new Error(`SMTP failed for ${to} password=secret`), { code: 'EAUTH', responseCode: 535 });
    return { accepted: [to] };
  } };
  const logger = { error(...args) { state.logs.push(args); } };
  return { state, service: createOrderCancellationEmailService({ deliveries, emailService, logger }) };
}

test('successful cancellation sends only one notification for repeated requests', async () => {
  const f = fixture();
  f.state.committed = true;
  assert.deepEqual(await f.service.sendForOrder(order), { sent: true });
  assert.deepEqual(await f.service.sendForOrder(order), { sent: false, reason: 'already_sent_or_in_progress' });
  assert.equal(f.state.sends, 1);
  assert.equal(f.state.status, 'sent');
});

test('delivery failure is logged safely and does not change cancellation state', async () => {
  const f = fixture({ fail: true });
  f.state.committed = true;
  assert.deepEqual(await f.service.sendForOrder(order), { sent: false, reason: 'delivery_failed' });
  assert.equal(f.state.status, 'pending');
  assert.match(JSON.stringify(f.state.logs), /EAUTH/);
  assert.doesNotMatch(JSON.stringify(f.state.logs), /reader@example\.com|password=secret/);
});

test('a failed cancellation notification can be retried and then duplicate calls are suppressed', async () => {
  let failing = true;
  const state = { status: 'pending', sends: 0 };
  const deliveries = {
    async ensure() {},
    async claim() { if (state.status !== 'pending') return false; state.status = 'sending'; return true; },
    async markSent() { state.status = 'sent'; },
    async markFailed() { state.status = 'pending'; },
  };
  const emailService = { async sendOrderCancellation() {
    state.sends += 1;
    if (failing) throw Object.assign(new Error('temporary transport failure'), { code: 'ETEMP' });
    return { accepted: ['reader@example.com'] };
  } };
  const service = createOrderCancellationEmailService({ deliveries, emailService, logger: { error() {} } });
  assert.deepEqual(await service.sendForOrder(order), { sent: false, reason: 'delivery_failed' });
  failing = false;
  assert.deepEqual(await service.sendForOrder(order), { sent: true });
  assert.deepEqual(await service.sendForOrder(order), { sent: false, reason: 'already_sent_or_in_progress' });
  assert.equal(state.sends, 2, 'one failed attempt and one successful delivery');
  assert.equal(state.status, 'sent');
});

test('cancellation email uses Folio branding and reports only known payment facts', async () => {
  const messages = [];
  const email = createEmailService({ EMAIL_FROM: 'Folio <folio@example.com>', GMAIL_USER: 'mailer', GMAIL_APP_PASSWORD: 'app-pass' }, { async sendMail(message) { messages.push(message); return { accepted: [message.to] }; } });
  await email.sendOrderCancellation({ to: order.email, order });
  assert.equal(messages[0].subject, 'Your Folio Order Has Been Cancelled');
  assert.match(messages[0].html, /folio<span/);
  assert.match(messages[0].html, /A Reader/);
  assert.match(messages[0].html, /FOLIO28/);
  assert.match(messages[0].html, /The Folio Book/);
  assert.match(messages[0].html, /No refund has been recorded/);
});
