import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError, asyncHandler } from '../errors.js';

const requestOtpLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const verifyOtpLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

export function createPaymentsRouter({ paymentService, requireAuth }) {
  const router = Router();
  router.use(...(Array.isArray(requireAuth) ? requireAuth : [requireAuth]));

  router.post('/otp', requestOtpLimit, asyncHandler(async (request, response) => {
    const result = await paymentService.requestOtp({ user: request.user, paymentMethod: request.body?.paymentMethod });
    response.status(201).json({ challenge: result, message: 'A payment verification code was sent to your registered email address.' });
  }));

  router.post('/otp/verify', verifyOtpLimit, asyncHandler(async (request, response) => {
    const { challengeId, otp } = request.body ?? {};
    const result = await paymentService.verifyOtp({ userId: request.user.id, challengeId, otp });
    response.status(result.reused ? 200 : 201).json(result);
  }));

  router.post('/orders/:orderId/confirmation-email/retry', asyncHandler(async (request, response) => {
    const { orderId } = request.params;
    if (!/^[1-9]\d{0,17}$/.test(orderId) || !Number.isSafeInteger(Number(orderId))) {
      throw new HttpError(400, 'INVALID_ORDER_ID', 'Choose a valid order.');
    }
    const result = await paymentService.retryOrderConfirmation({ userId: request.user.id, orderId: Number(orderId) });
    response.json({ result, message: result.sent ? 'Order confirmation email sent.' : 'Order confirmation email is pending or could not be delivered. You can retry shortly.' });
  }));

  router.post('/orders/:orderId', asyncHandler(async () => {
    throw new HttpError(410, 'PAYMENT_ROUTE_UNAVAILABLE', 'This payment link is no longer available. Return to checkout to continue.');
  }));

  return router;
}
