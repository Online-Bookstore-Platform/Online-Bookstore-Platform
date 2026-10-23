import { badRequest } from '../shared/errors.js';

/*
 * Delivery details (SRS 5.4). The browser checks the same rules while typing
 * (frontend/src/features/uditi/checkout/deliveryRules.js); this server-side check is the
 * authority. Messages are plain language (USE-2) and each field gets one message.
 */

export const DELIVERY_FIELDS = ['recipientName', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'];

const tidy = value => value.replace(/\s+/g, ' ').trim();
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const isIndia = country => /^(india|in|bharat)$/i.test(country);
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Required single-line text: returns an error message, or '' when fine. */
function checkText(value, label, { min = 1, max, tooShort } = {}) {
  if (value === '') return `${label} is required.`;
  if (value.length < min) return tooShort ?? `${label} is too short.`;
  if (value.length > max) return `${label} is too long (up to ${max} characters).`;
  if (CONTROL_CHARACTERS.test(value)) return `${label} contains characters that are not allowed.`;
  return '';
}

/**
 * Validate and normalise delivery details.
 * Returns { recipientName, phone, addressLine1, addressLine2 (null if empty), city, state,
 * postalCode, country } or throws a 400 listing every problem field.
 */
export function parseDeliveryDetails(body) {
  if (!isPlainObject(body)) {
    throw badRequest('Some of the delivery details are missing or not valid.', [{ field: 'body', message: 'Send the delivery details as a JSON object.' }]);
  }

  // Anything that is not text counts as missing; unknown fields are ignored.
  const v = Object.fromEntries(DELIVERY_FIELDS.map(field => [field, typeof body[field] === 'string' ? tidy(body[field]) : '']));
  const errors = {};
  const set = (field, message) => {
    if (message) errors[field] = message;
  };

  set('recipientName', checkText(v.recipientName, 'Recipient name', { min: 2, max: 100, tooShort: 'Enter the recipient’s full name.' }));
  if (!errors.recipientName && !/\p{L}/u.test(v.recipientName)) errors.recipientName = 'Enter the recipient’s full name.';

  const phone = v.phone.replace(/[\s().-]/g, '');
  if (phone === '') errors.phone = 'Phone number is required.';
  else if (!/^\+?[0-9]{10,15}$/.test(phone)) errors.phone = 'Enter a valid phone number, for example 9876543210 or +91 98765 43210.';

  set('addressLine1', checkText(v.addressLine1, 'Address', { min: 3, max: 150, tooShort: 'Enter the house number and street.' }));
  if (typeof body.addressLine2 === 'string' || body.addressLine2 == null) {
    if (v.addressLine2.length > 150) errors.addressLine2 = 'Address line 2 is too long (up to 150 characters).';
    else if (CONTROL_CHARACTERS.test(v.addressLine2)) errors.addressLine2 = 'Address line 2 contains characters that are not allowed.';
  } else errors.addressLine2 = 'Address line 2 must be text.';

  set('city', checkText(v.city, 'City', { min: 2, max: 80 }));
  set('state', checkText(v.state, 'State', { min: 2, max: 80 }));
  set('country', checkText(v.country, 'Country', { min: 2, max: 60 }));
  set('postalCode', checkText(v.postalCode, 'Postal code', { max: 12 }));

  if (!errors.postalCode && !errors.country) {
    if (isIndia(v.country)) {
      if (!/^[1-9][0-9]{5}$/.test(v.postalCode)) errors.postalCode = 'Enter a 6-digit PIN code, for example 560001.';
    } else if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,10}[A-Za-z0-9]$/.test(v.postalCode)) {
      errors.postalCode = 'Enter a valid postal code.';
    }
  }

  const problems = DELIVERY_FIELDS.filter(field => errors[field]).map(field => ({ field, message: errors[field] }));
  if (problems.length > 0) throw badRequest('Some of the delivery details are missing or not valid.', problems);

  return { ...v, phone, addressLine2: v.addressLine2 || null };
}
