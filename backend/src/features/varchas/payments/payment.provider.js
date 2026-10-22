import { HttpError } from '../errors.js';

export function createPaymentProvider(env = process.env) {
  if (env.PAYMENT_PROVIDER !== 'mock') {
    return { mode: 'unconfigured', async process() { throw new HttpError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'No payment sandbox is configured.'); } };
  }
  const result = env.PAYMENT_MOCK_RESULT || 'declined';
  const outcomes = { approved: 'succeeded', declined: 'failed', cancelled: 'cancelled', timeout: 'timed_out' };
  if (!outcomes[result]) throw new Error('PAYMENT_MOCK_RESULT must be approved, declined, cancelled, or timeout.');
  return {
    mode: 'mock',
    async process({ paymentId }) {
      return { status: outcomes[result], providerReference: `mock-${paymentId}` };
    },
    async cancel({ paymentId }) { return { status: 'cancelled', providerReference: `mock-${paymentId}` }; },
  };
}
