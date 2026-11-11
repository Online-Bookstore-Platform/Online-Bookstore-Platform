import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { HttpError } from '../errors.js';
import { logSmtpFailure } from '../authentication/email.service.js';

const METHODS = new Set(['card', 'upi', 'netbanking']);

function resetHash(secret, challengeId, userId, otp) {
  return createHmac('sha256', secret).update(`${challengeId}:${userId}:${otp}`).digest('hex');
}

export function createPaymentService({ orders, payments, otpChallenges, emailService, orderConfirmationEmails, secret, logger = console }) {
  const pepper = secret || randomBytes(32).toString('hex');

  return {
    async requestOtp({ user, paymentMethod }) {
      if (!METHODS.has(paymentMethod)) throw new HttpError(400, 'INVALID_PAYMENT_METHOD', 'Choose UPI, card, or net banking to continue.');
      if (!user?.id || !user?.email) throw new HttpError(401, 'AUTHENTICATION_REQUIRED', 'Sign in to verify your payment by email.');
      if (!emailService?.configured || !otpChallenges?.create) {
        throw new HttpError(503, 'PAYMENT_OTP_UNAVAILABLE', 'Email verification is unavailable. Configure Gmail SMTP to continue.');
      }
      await orders.validatePaymentCheckout(user.id);

      const id = randomUUID();
      const otp = String(randomInt(100000, 1000000));
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const saved = await otpChallenges.create({
        id, userId: user.id, paymentMethod,
        otpHash: resetHash(pepper, id, user.id, otp), expiresAt,
      });
      if (saved.cooldown) throw new HttpError(429, 'PAYMENT_OTP_COOLDOWN', 'Wait before requesting another payment code.');

      try {
        await emailService.sendPaymentOtp({ to: user.email, otp, paymentMethod });
      } catch (error) {
        logSmtpFailure(logger, error);
        await otpChallenges.invalidate?.(id, user.id);
        throw new HttpError(503, 'PAYMENT_OTP_DELIVERY_FAILED', 'We could not deliver the payment code. Check the email setup and try again.');
      }
      return { challengeId: id, expiresAt, resendAt: saved.resendAt };
    },

    async verifyOtp({ userId, challengeId, otp }) {
      if (typeof challengeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(challengeId) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
        throw new HttpError(400, 'INVALID_PAYMENT_OTP_INPUT', 'Enter the six-digit code from your Folio payment email.');
      }
      if (!orders?.createAfterPaymentOtp || !payments?.recordSimulatedSuccess || !otpChallenges?.verify) {
        throw new HttpError(503, 'PAYMENT_OTP_UNAVAILABLE', 'Order verification is not available right now. Please try again later.');
      }

      const result = await orders.createAfterPaymentOtp({
        userId,
        challengeId,
        verifyChallenge: connection => otpChallenges.verify({
          id: challengeId,
          userId,
          otpHash: resetHash(pepper, challengeId, userId, otp),
          connection,
        }),
        recordPayment: (connection, payment) => payments.recordSimulatedSuccess(payment, connection),
      });

      if (result.verification && !result.verification.ok) {
        const { reason } = result.verification;
        if (reason === 'expired') throw new HttpError(410, 'PAYMENT_OTP_EXPIRED', 'This payment code has expired. Request a new code.');
        if (reason === 'used') throw new HttpError(409, 'PAYMENT_OTP_ALREADY_USED', 'This payment code has already been used.');
        if (reason === 'attempts_exceeded') throw new HttpError(429, 'PAYMENT_OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect codes. Request a new payment code.');
        throw new HttpError(400, 'PAYMENT_OTP_INCORRECT', 'That code is incorrect. Check the email and try again.');
      }
      // createAfterPaymentOtp resolves only after its MySQL transaction commits.
      // Delivery failures are logged and queued for retry without changing the paid order result.
      if (result.order) {
        logger?.info?.('[email] Order confirmation dispatcher reached after committed order', {
          orderId: result.order.id, configured: Boolean(orderConfirmationEmails),
        });
        if (!orderConfirmationEmails) {
          logger?.error?.('[email] Order confirmation dispatcher is unavailable', {
            category: 'ORDER_CONFIRMATION_NOT_CONFIGURED', orderId: result.order.id,
          });
        } else {
          try { await orderConfirmationEmails.sendForOrder(result.order); }
          catch (error) { logSmtpFailure(logger, error, 'order_confirmation_dispatcher'); }
        }
      }
      return { order: result.order, reused: Boolean(result.reused) };
    },

    async retryOrderConfirmation({ userId, orderId }) {
      if (!orderConfirmationEmails) throw new HttpError(503, 'ORDER_CONFIRMATION_UNAVAILABLE', 'Order confirmation email retry is unavailable.');
      return orderConfirmationEmails.retryForCustomer({ userId, orderId });
    },
  };
}
