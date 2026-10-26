const outcomes = {
  approved: 'succeeded',
  declined: 'failed',
  cancelled: 'cancelled',
  timeout: 'timed_out',
};

/** Internal order checkout outcome; this provider never contacts a financial service. */
export function createPaymentProvider(env = process.env) {
  const outcome = env.FOLIO_CHECKOUT_OUTCOME || 'approved';
  if (!outcomes[outcome]) {
    throw new Error('FOLIO_CHECKOUT_OUTCOME must be approved, declined, cancelled, or timeout.');
  }

  return {
    mode: 'internal',
    async process({ paymentId }) {
      if (env.NODE_ENV !== 'test') await new Promise(resolve => setTimeout(resolve, 700));
      if (outcome === 'timeout') {
        const error = new Error('Checkout did not finish in time.');
        error.code = 'PAYMENT_TIMEOUT';
        throw error;
      }
      return { status: outcomes[outcome], providerReference: `folio-${paymentId}` };
    },
    async cancel({ paymentId }) {
      return { status: 'cancelled', providerReference: `folio-${paymentId}` };
    },
  };
}
