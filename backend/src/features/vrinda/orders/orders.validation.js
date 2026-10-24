import { badRequest } from '../shared/errors.js';
import { parseDeliveryDetails } from '../../uditi/checkout/checkout.validation.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function deliveryError(error) {
  if (error?.status !== 400) throw error;
  throw badRequest(error.message, error.details, error.code);
}

export function parseOrderDraft(body) {
  if (!isObject(body)) throw badRequest('Send the order details as a JSON object.', [{ field: 'body', message: 'An object is required.' }]);
  if (body.delivery === undefined) return null;
  try {
    return parseDeliveryDetails(body.delivery);
  } catch (error) {
    deliveryError(error);
  }
}

export function parseIdempotencyKey(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length < 1 || value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw badRequest('The order request could not be safely retried.', [{ field: 'Idempotency-Key', message: 'Use a key between 1 and 100 printable characters.' }]);
  }
  return value;
}

