import { logSmtpFailure } from '../../varchas/authentication/email.service.js';
import { HttpError } from '../shared/errors.js';

export function createOrderConfirmationService({ deliveries, emailService, orders, logger = console }) {
  const log = (level, message, details) => logger?.[level]?.(message, details);
  const maskAddress = value => {
    const [local = '', domain = ''] = String(value || '').split('@');
    if (!local || !domain) return '[invalid email]';
    const labels = domain.split('.');
    const tld = labels.length > 1 ? labels.at(-1) : '';
    return `${local[0]}***@${labels[0][0] || '*'}***${tld ? `.${tld}` : ''}`;
  };

  async function sendForOrder(order) {
    if (!order || order.paymentStatus !== 'succeeded' || order.status !== 'confirmed') return { sent: false, reason: 'not_paid' };
    log('info', '[email] Order confirmation triggered after order commit', { orderId: order.id });
    if (!deliveries || !emailService?.sendOrderConfirmation || !order.email) {
      log('error', '[email] Order confirmation unavailable', {
        category: 'ORDER_CONFIRMATION_NOT_CONFIGURED', orderId: order.id,
        recipient: order.email ? maskAddress(order.email) : '[missing]',
        emailServiceConfigured: Boolean(emailService?.configured), deliveriesConfigured: Boolean(deliveries),
      });
      return { sent: false, reason: 'unavailable' };
    }

    log('info', '[email] Order confirmation recipient identified', { orderId: order.id, recipient: maskAddress(order.email) });
    let claimed = false;
    try {
      // Older paid orders may predate the outbox. INSERT IGNORE preserves existing
      // sent/pending state while allowing a safe retry for orders with no record.
      await deliveries.ensure?.(order.id);
      claimed = await deliveries.claim(order.id);
      if (!claimed) {
        log('info', '[email] Order confirmation skipped by idempotency guard', { orderId: order.id, reason: 'already_sent_or_in_progress' });
        return { sent: false, reason: 'already_sent_or_in_progress' };
      }

      log('info', '[email] SMTP sending started', { orderId: order.id, recipient: maskAddress(order.email) });
      const result = await emailService.sendOrderConfirmation({ to: order.email, order });
      const acceptedCount = Array.isArray(result?.accepted) ? result.accepted.length : null;
      const rejectedCount = Array.isArray(result?.rejected) ? result.rejected.length : 0;
      if (acceptedCount === 0) {
        await deliveries.markFailed(order.id, 'SMTP_RECIPIENT_REJECTED');
        log('error', '[email] SMTP rejected order confirmation recipient', { orderId: order.id, recipient: maskAddress(order.email), acceptedCount, rejectedCount });
        return { sent: false, reason: 'delivery_failed' };
      }

      log('info', '[email] SMTP accepted order confirmation', {
        orderId: order.id, recipient: maskAddress(order.email), acceptedCount, rejectedCount,
        messageId: typeof result?.messageId === 'string' ? result.messageId.slice(0, 120) : undefined,
      });
      await deliveries.markSent(order.id);
      return { sent: true };
    } catch (error) {
      if (claimed) {
        try { await deliveries.markFailed(order.id, error?.code || 'SMTP_DELIVERY_FAILED'); }
        catch (markError) {
          log('error', '[email] Could not requeue order confirmation', {
            category: 'ORDER_CONFIRMATION_REQUEUE_FAILED', orderId: order.id, code: markError?.code,
          });
        }
      }
      logSmtpFailure({ error: (message, details) => log('error', message, details) }, error, 'order_confirmation');
      return { sent: false, reason: 'delivery_failed' };
    }
  }

  return {
    sendForOrder,
    async retryForCustomer({ orderId, userId }) {
      const order = await orders.get(userId, orderId);
      if (order.paymentStatus !== 'succeeded' || order.status !== 'confirmed') {
        throw new HttpError(409, 'ORDER_NOT_CONFIRMED', 'Order confirmation email is available only for successfully paid orders.');
      }
      return sendForOrder(order);
    },
  };
}
