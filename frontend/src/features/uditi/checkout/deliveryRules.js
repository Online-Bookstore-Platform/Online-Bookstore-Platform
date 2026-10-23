/*
 * Delivery-detail rules, checked in the browser while the person fills in the form.
 * They deliberately mirror backend/src/features/uditi/checkout/checkout.validation.js
 * (the server check is the authority); deliveryRules.test.js runs both on the same inputs
 * so the two cannot drift apart.
 */

export const DELIVERY_FIELDS = ['recipientName', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'postalCode', 'country'];

export const FIELD_LABELS = {
  recipientName: 'Recipient name',
  phone: 'Phone number',
  addressLine1: 'Address',
  addressLine2: 'Address line 2',
  city: 'City',
  state: 'State',
  postalCode: 'Postal code',
  country: 'Country',
};

export const emptyDelivery = (overrides = {}) => ({ recipientName: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: 'India', ...overrides });

/** Form values from saved details (null becomes an empty box). */
export function toFormValues(delivery, fallback = {}) {
  const source = delivery ?? fallback ?? {};
  return emptyDelivery(Object.fromEntries(DELIVERY_FIELDS.filter(field => typeof source[field] === 'string').map(field => [field, source[field]])));
}

const tidy = value => value.replace(/\s+/g, ' ').trim();
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const isIndia = country => /^(india|in|bharat)$/i.test(country);

function checkText(value, label, { min = 1, max, tooShort } = {}) {
  if (value === '') return `${label} is required.`;
  if (value.length < min) return tooShort ?? `${label} is too short.`;
  if (value.length > max) return `${label} is too long (up to ${max} characters).`;
  if (CONTROL_CHARACTERS.test(value)) return `${label} contains characters that are not allowed.`;
  return '';
}

/**
 * @param {Record<string,unknown>} input  raw form values
 * @returns {{ errors: Record<string,string>, clean: object }}  one message per bad field, and the tidied values
 */
export function validateDelivery(input) {
  const v = Object.fromEntries(DELIVERY_FIELDS.map(field => [field, typeof input?.[field] === 'string' ? tidy(input[field]) : '']));
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
  if (typeof input?.addressLine2 === 'string' || input?.addressLine2 == null) {
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

  return { errors, clean: { ...v, phone, addressLine2: v.addressLine2 || null } };
}

/** The backend's 400 details ([{ field, message }]) as { field: message } for the form. */
export function errorsFromDetails(details) {
  const errors = {};
  for (const detail of details ?? []) {
    if (DELIVERY_FIELDS.includes(detail?.field) && !errors[detail.field]) errors[detail.field] = detail.message;
  }
  return errors;
}

/** The first field, in form order, that has an error. */
export const firstInvalidField = errors => DELIVERY_FIELDS.find(field => errors[field]);
