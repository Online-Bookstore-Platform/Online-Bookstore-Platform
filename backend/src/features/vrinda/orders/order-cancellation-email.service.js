import { logSmtpFailure } from '../../varchas/authentication/email.service.js';

export function createOrderCancellationEmailService({ deliveries, emailService, logger = console }) {
  const log = (level, message, details) => logger?.[level]?.(message, details);
  return {
    async sendForOrder(order) {
      if (!deliveries || !emailService?.sendOrderCancellation || !order?.email) {
        log('error', '[email] Order cancellation notification unavailable', {
          category: 'ORDER_CANCELLATION_EMAIL_UNAVAILABLE', orderId: order?.id,
          emailServiceConfigured: Boolean(emailService?.configured), deliveriesConfigured: Boolean(deliveries),
        });
        return { sent: false, reason: 'unavailable' };
      }
      let claimed = false;
      try {
        await deliveries.ensure(order.id);
        claimed = await deliveries.claim(order.id);
        if (!claimed) return { sent: false, reason: 'already_sent_or_in_progress' };
        const result = await emailService.sendOrderCancellation({ to: order.email, order });
        if (Array.isArray(result?.accepted) && result.accepted.length === 0) {
          await deliveries.markFailed(order.id, 'SMTP_RECIPIENT_REJECTED');
          log('error', '[email] Order cancellation notification recipient rejected', { category: 'SMTP_RECIPIENT_REJECTED', orderId: order.id });
          return { sent: false, reason: 'delivery_failed' };
        }
        await deliveries.markSent(order.id);
        return { sent: true };
      } catch (error) {
        if (claimed) {
          try { await deliveries.markFailed(order.id, error?.code || 'SMTP_DELIVERY_FAILED'); }
          catch (markError) { log('error', '[email] Could not requeue order cancellation notification', { category: 'ORDER_CANCELLATION_EMAIL_REQUEUE_FAILED', orderId: order.id, code: markError?.code }); }
        }
        logSmtpFailure({ error: (message, details) => log('error', message, details) }, error, 'order_cancellation');
        return { sent: false, reason: 'delivery_failed' };
      }
    },
  };
}
