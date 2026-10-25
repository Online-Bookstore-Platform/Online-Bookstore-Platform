import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../errors.js';

const cents = amount => Math.round(Number(amount) * 100);

export function createPaymentProvider(env = process.env, fetchImpl = globalThis.fetch) {
  if (env.PAYMENT_PROVIDER === 'razorpay') {
    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret || !keyId.startsWith('rzp_test_')) return { mode: 'unconfigured' };
    async function request(path, options = {}) {
      const response = await fetchImpl(`https://api.razorpay.com/v1${path}`, {
        ...options,
        headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json', ...options.headers },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new HttpError(502, 'PAYMENT_PROVIDER_ERROR', data.error?.description || 'Razorpay could not complete this request.');
      return data;
    }
    return {
      mode: 'razorpay', keyId,
      async initiate({ paymentId, amount, currency }) {
        const order = await request('/orders', { method: 'POST', body: JSON.stringify({ amount: cents(amount), currency, receipt: `folio_${paymentId}` }) });
        return { providerOrderId: order.id, amount: order.amount, currency: order.currency };
      },
      verifySignature({ providerOrderId, providerPaymentId, signature }) {
        const expected = createHmac('sha256', keySecret).update(`${providerOrderId}|${providerPaymentId}`).digest();
        let supplied;
        try { supplied = Buffer.from(signature, 'hex'); } catch { return false; }
        return supplied.length === expected.length && timingSafeEqual(supplied, expected);
      },
      async verifyPayment({ providerOrderId, providerPaymentId, amount, currency }) {
        const payment = await request(`/payments/${encodeURIComponent(providerPaymentId)}`);
        if (payment.order_id !== providerOrderId || payment.amount !== cents(amount) || payment.currency !== currency) return { status: 'failed', providerReference: payment.id };
        if (payment.status === 'captured') return { status: 'succeeded', providerReference: payment.id };
        if (payment.status === 'authorized') return { status: 'pending', providerReference: payment.id };
        if (payment.status === 'failed') return { status: 'failed', providerReference: payment.id };
        return { status: 'pending', providerReference: payment.id };
      },
      async cancel() { return { status: 'cancelled' }; },
    };
  }
  if (env.PAYMENT_PROVIDER !== 'mock') return { mode: 'unconfigured' };
  if (env.NODE_ENV === 'production') {
    throw new Error('PAYMENT_PROVIDER=mock is not permitted in production. Configure a genuine payment provider.');
  }
  const result = env.PAYMENT_MOCK_RESULT || 'declined';
  const outcomes = { approved: 'succeeded', declined: 'failed', cancelled: 'cancelled', timeout: 'timed_out' };
  if (!outcomes[result]) throw new Error('PAYMENT_MOCK_RESULT must be approved, declined, cancelled, or timeout.');
  return {
    mode: 'mock',
    async initiate({ paymentId, amount, currency }) { return { providerOrderId: `mock-order-${paymentId}`, amount: cents(amount), currency }; },
    async process({ paymentId }) { return { status: outcomes[result], providerReference: `mock-${paymentId}` }; },
    async cancel({ paymentId }) { return { status: 'cancelled', providerReference: `mock-${paymentId}` }; },
  };
}
