import nodemailer from 'nodemailer';
import addressParser from 'nodemailer/lib/addressparser/index.js';

export function parseEmailFrom(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('EMAIL_FROM is empty.');
  const parsed = addressParser(value);
  if (parsed.length !== 1 || !parsed[0].address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed[0].address)) {
    throw new Error('EMAIL_FROM must contain one valid sender address, optionally with a display name.');
  }
  return { name: parsed[0].name || '', address: parsed[0].address };
}

export function normalizeAppPassword(value) {
  return String(value || '').replace(/\s+/g, '');
}

function smtpTransportOptions(env) {
  return {
    host: 'smtp.gmail.com', port: 465, secure: true,
    connectionTimeout: 10_000, greetingTimeout: 8_000, socketTimeout: 15_000,
    auth: { user: env.GMAIL_USER?.trim(), pass: normalizeAppPassword(env.GMAIL_APP_PASSWORD) },
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function formatMoney(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(amount) || 0);
}

function orderConfirmationHtml(order) {
  const e = escapeHtml;
  const currency = order.currency || 'INR';
  const items = (order.items || []).map(item => `<tr><td style="padding:12px 8px;border-bottom:1px solid #eee">${e(item.title)}</td><td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:center">${e(item.quantity)}</td><td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right">${e(formatMoney(item.unitPrice, currency))}</td><td style="padding:12px 8px;border-bottom:1px solid #eee;text-align:right">${e(formatMoney(Number(item.unitPrice) * Number(item.quantity), currency))}</td></tr>`).join('');
  const address = [order.addressLine1, order.addressLine2, order.city, order.state, order.postalCode, order.country].filter(Boolean).map(e).join(', ');
  const placedAt = new Date(order.createdAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const subtotal = Number(order.subtotal ?? order.totalAmount) || 0;
  const deliveryCharge = Number(order.deliveryCharge) || 0;
  const estimatedDelivery = order.estimatedDelivery ? `<p style="margin:8px 0"><strong>Estimated delivery:</strong> ${e(order.estimatedDelivery)}</p>` : '';
  const paymentVerification = order.paymentStatus === 'succeeded' ? 'Verified by email' : order.paymentStatus;
  return `<div style="margin:0;background:#f6f4ef;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#292820"><div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden"><div style="padding:28px 32px;background:#243b35;color:#fff"><div style="font-size:27px;font-weight:700;letter-spacing:-1px">folio<span style="color:#e1bd72">.</span></div><p style="margin:18px 0 0;font-size:22px;font-weight:700">Thank you for your order, ${e(order.customerName || order.recipientName)}!</p><p style="margin:8px 0 0;color:#e4e9e5">Your books are being prepared with care.</p></div><div style="padding:28px 32px"><p style="margin:0 0 18px">Order <strong>#${e(order.orderNumber || order.id)}</strong> · Placed ${e(placedAt)}</p><div style="padding:16px;background:#f8f7f3;border-radius:8px;margin-bottom:22px"><h2 style="font-size:16px;margin:0 0 10px">Delivery address</h2><p style="margin:0;line-height:1.6">${e(order.recipientName || order.customerName)}<br>${address}</p>${order.phone ? `<p style="margin:6px 0 0">${e(order.phone)}</p>` : ''}</div><h2 style="font-size:18px;margin:0 0 10px">Your order</h2><div style="overflow-x:auto"><table role="presentation" style="border-collapse:collapse;width:100%;font-size:14px"><thead><tr><th style="padding:10px 8px;text-align:left;border-bottom:2px solid #ddd">Book</th><th style="padding:10px 8px;text-align:center;border-bottom:2px solid #ddd">Qty</th><th style="padding:10px 8px;text-align:right;border-bottom:2px solid #ddd">Each</th><th style="padding:10px 8px;text-align:right;border-bottom:2px solid #ddd">Total</th></tr></thead><tbody>${items}</tbody></table></div><div style="max-width:330px;margin:18px 0 18px auto;font-size:14px"><p style="display:flex;justify-content:space-between;margin:8px 0"><span>Subtotal</span><strong>${e(formatMoney(subtotal, currency))}</strong></p><p style="display:flex;justify-content:space-between;margin:8px 0"><span>Delivery</span><strong>${deliveryCharge ? e(formatMoney(deliveryCharge, currency)) : 'Free'}</strong></p><p style="display:flex;justify-content:space-between;margin:12px 0;padding-top:12px;border-top:1px solid #ddd;font-size:17px"><span>Order total</span><strong>${e(formatMoney(order.totalAmount, currency))}</strong></p></div><div style="padding:16px;background:#f8f7f3;border-radius:8px"><p style="margin:5px 0"><strong>Checkout method:</strong> ${e(({ upi: 'UPI', card: 'Card', netbanking: 'Net Banking' })[order.paymentMethod] || order.paymentMethod)}</p><p style="margin:5px 0"><strong>Payment verification:</strong> ${e(paymentVerification)}</p><p style="margin:5px 0"><strong>Order status:</strong> ${e(order.status)}</p>${estimatedDelivery}</div><p style="margin:24px 0 0;line-height:1.6">Thanks for shopping with Folio. We hope your next great read is just around the corner.</p></div><div style="padding:18px 32px;background:#f6f4ef;color:#777;font-size:12px">Folio Online Bookstore</div></div></div>`;
}

export function createEmailService(env = process.env, transportOverride, logger = console) {
  const parsedFrom = (() => { try { return parseEmailFrom(env.EMAIL_FROM); } catch { return null; } })();
  const configured = Boolean(env.GMAIL_USER?.trim() && normalizeAppPassword(env.GMAIL_APP_PASSWORD) && parsedFrom);
  const transport = transportOverride || (configured ? nodemailer.createTransport(smtpTransportOptions(env)) : null);
  const from = parsedFrom ? { name: parsedFrom.name, address: parsedFrom.address } : env.EMAIL_FROM;
  const send = async message => {
    if (!transport) throw new Error('Gmail SMTP is not configured correctly. Check EMAIL_FROM, GMAIL_USER, and GMAIL_APP_PASSWORD.');
    return transport.sendMail({ from, ...message });
  };
  return {
    configured: Boolean(transport && configured),
    sender: parsedFrom,
    async verify() {
      if (!configured || !transport) throw new Error('Gmail SMTP configuration is incomplete or EMAIL_FROM is invalid.');
      return transport.verify();
    },
    async sendPaymentOtp({ to, otp, paymentMethod }) {
      const method = ({ card: 'card', upi: 'UPI', netbanking: 'net banking' })[paymentMethod] || 'online';
      return send({
        to, subject: 'Your Folio order verification code',
        text: `Your Folio verification code is ${otp}. Enter it to confirm your ${method} order. It expires in 5 minutes and can only be used once. If you did not place this order, ignore this email.`,
        html: `<div style="margin:0;background:#f6f4ef;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#292820"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden"><div style="padding:24px 30px;background:#243b35;color:#fff"><div style="font-size:26px;font-weight:700;letter-spacing:-1px">folio<span style="color:#e1bd72">.</span></div></div><div style="padding:28px 30px"><h1 style="margin:0 0 12px;font-size:22px">Verify your order</h1><p style="line-height:1.6">Enter this code to confirm your ${method} order:</p><p style="margin:22px 0;padding:18px;text-align:center;background:#f8f7f3;border-radius:8px;font-size:32px;letter-spacing:8px;font-weight:700">${otp}</p><p style="line-height:1.6">This code expires in <strong>5 minutes</strong> and can only be used once.</p><p style="line-height:1.6">If you did not place this order, you can ignore this email.</p></div><div style="padding:18px 30px;background:#f6f4ef;color:#777;font-size:12px">Folio Online Bookstore</div></div></div>`,
      });
    },
    async sendPasswordResetOtp({ to, otp }) {
      return send({
        to, subject: 'Your Folio password reset code',
        text: `Your Folio password reset code is ${otp}. It expires in 5 minutes. If you did not request this, you can ignore this email.`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#24231f"><p style="font-size:22px;font-weight:700">folio.</p><h1 style="font-size:22px">Reset your password</h1><p>Use this verification code to continue:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700">${otp}</p><p>This code expires in <strong>5 minutes</strong> and can only be used once.</p><p>If you did not request a password reset, ignore this message. Your password will remain unchanged.</p><hr><p style="color:#777">Folio Online Bookstore</p></div>`,
      });
    },
    async sendOrderConfirmation({ to, order }) {
      const displayId = order.orderNumber || order.id;
      const method = ({ upi: 'UPI', card: 'Card', netbanking: 'Net Banking' })[order.paymentMethod] || order.paymentMethod;
      return send({
        to,
        subject: `Your Folio Order Confirmation – Order #${displayId}`,
        text: `Thank you for shopping with Folio, ${order.customerName || order.recipientName}. Order #${displayId} is ${order.status}. Payment verification: ${order.paymentStatus === 'succeeded' ? 'complete by email' : order.paymentStatus}. Order total: ${formatMoney(order.totalAmount, order.currency || 'INR')}. Checkout method: ${method}.`,
        html: orderConfirmationHtml(order),
      });
    },
  };
}

export function logSmtpFailure(logger, error, context = 'payment_otp') {
  const safeResponse = typeof error?.response === 'string'
    ? error.response.replace(/[\r\n\t]+/g, ' ').replace(/\b[^\s@]+@[^\s@]+\b/g, '[email]').replace(/\b\d{6}\b/g, '[code]').replace(/(pass(?:word)?|auth(?:entication)?|otp|token)\s*[:=]\s*\S+/ig, '$1=[redacted]').slice(0, 240)
    : undefined;
  logger.error('[email] SMTP delivery failed', {
    category: 'SMTP_DELIVERY_FAILED', context,
    // SMTP messages can echo credentials, recipients, or message contents. The
    // protocol diagnostics below identify the failure without logging that text.
    errorName: typeof error?.name === 'string' ? error.name.slice(0, 64) : undefined,
    code: typeof error?.code === 'string' ? error.code.slice(0, 64) : undefined,
    command: typeof error?.command === 'string' ? error.command.slice(0, 64) : undefined,
    responseCode: Number.isInteger(error?.responseCode) ? error.responseCode : undefined,
    response: safeResponse,
  });
}

export function getSmtpTransportOptions(env) { return smtpTransportOptions(env); }
