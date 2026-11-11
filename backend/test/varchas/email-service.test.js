import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailService, getSmtpTransportOptions, normalizeAppPassword, parseEmailFrom } from '../../src/features/varchas/authentication/email.service.js';

const testEnv = { EMAIL_FROM: 'Folio Bookstore <folio@example.com>', GMAIL_USER: 'folio@example.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' };

test('Gmail reset email uses a reusable transport and professional Folio template', async () => {
  const sent = [];
  const service = createEmailService(testEnv, { async sendMail(message) { sent.push(message); return { messageId: 'test-message' }; } });
  assert.equal(service.configured, true);
  await service.sendPasswordResetOtp({ to: 'reader@example.com', otp: '123456' });
  assert.equal(sent[0].to, 'reader@example.com');
  assert.match(sent[0].subject, /Folio/);
  assert.match(sent[0].html, /123456/);
  assert.match(sent[0].html, /5 minutes/);
});

test('payment verification email uses professional order-confirmation wording', async () => {
  const sent = [];
  const service = createEmailService(testEnv, { async sendMail(message) { sent.push(message); } });
  await service.sendPaymentOtp({ to: 'reader@example.com', otp: '283940', paymentMethod: 'upi' });
  assert.equal(sent[0].to, 'reader@example.com');
  assert.match(sent[0].subject, /order verification/i);
  assert.match(sent[0].text, /confirm your UPI order/i);
  assert.match(sent[0].html, /283940/);
  assert.match(sent[0].html, /Verify your order/);
  assert.doesNotMatch(sent[0].html, /demo|simulat|college-project|no payment will be collected/i);
  assert.match(sent[0].html, /5 minutes/);
  assert.doesNotMatch(sent[0].text, /UPI PIN|CVV|banking password/i);
});

test('Gmail email service reports missing configuration instead of pretending to send', async () => {
  const service = createEmailService({});
  assert.equal(service.configured, false);
  await assert.rejects(service.sendPasswordResetOtp({ to: 'reader@example.com', otp: '123456' }), /EMAIL_FROM, GMAIL_USER, and GMAIL_APP_PASSWORD/);
});

test('sender display name and grouped Gmail app password parse correctly; Gmail uses explicit TLS settings', () => {
  assert.deepEqual(parseEmailFrom('Folio Bookstore <varchas2006@gmail.com>'), { name: 'Folio Bookstore', address: 'varchas2006@gmail.com' });
  assert.equal(normalizeAppPassword('abcd efgh ijkl mnop'), 'abcdefghijklmnop');
  assert.throws(() => parseEmailFrom('Folio <not-an-email>'));
  const options = getSmtpTransportOptions(testEnv);
  assert.equal(options.host, 'smtp.gmail.com');
  assert.equal(options.port, 465);
  assert.equal(options.secure, true);
  assert.equal(options.auth.pass, 'abcdefghijklmnop');
  assert.equal(options.connectionTimeout, 10_000);
});

test('invalid EMAIL_FROM keeps SMTP unconfigured', async () => {
  const service = createEmailService({ ...testEnv, EMAIL_FROM: 'Folio <bad>' });
  assert.equal(service.configured, false);
});

test('order confirmation email contains a safe, complete order summary addressed to the registered customer', async () => {
  const sent = [];
  const service = createEmailService(testEnv, { async sendMail(message) { sent.push(message); } });
  await service.sendOrderConfirmation({
    to: 'reader@gmail.com',
    order: {
      id: 27, orderNumber: 'FOLIO27', customerName: 'Asha Reader', recipientName: 'Asha Reader', email: 'reader@gmail.com',
      createdAt: new Date('2026-10-31T10:00:00.000Z'), status: 'confirmed', paymentStatus: 'succeeded', paymentMethod: 'upi',
      totalAmount: 499.5, currency: 'INR', addressLine1: '12 Paper Lane', addressLine2: 'Apt <4>', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India',
      items: [{ title: 'The <Book>', quantity: 2, unitPrice: 249.75 }],
    },
  });
  const mail = sent[0];
  assert.equal(mail.to, 'reader@gmail.com');
  assert.equal(mail.subject, 'Your Folio Order Confirmation – Order #FOLIO27');
  for (const content of ['FOLIO27', 'Asha Reader', '12 Paper Lane', 'Bengaluru', 'The &lt;Book&gt;', '249.75', '499.50', 'UPI', 'Verified by email', 'confirmed', 'Order total', 'Delivery']) {
    assert.ok(mail.html.includes(content), `confirmation includes ${content}`);
  }
  assert.doesNotMatch(mail.html, /Apt <4>/);
  assert.doesNotMatch(mail.html, /amount paid|payment status|succeeded|demo|simulat/i);
});
