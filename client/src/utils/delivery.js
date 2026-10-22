// Delivery-form rules. They mirror server/validators/checkout.validators.js so mistakes
// show up while typing; the server checks everything again and stays the authority.

export const EMPTY_DELIVERY = Object.freeze({
  recipientName: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
});

const tidy = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const isIndia = (country) => /^(india|in|bharat)$/i.test(country);

/** Required single-line text: returns an error message, or '' when fine. */
function checkText(value, label, { min = 1, max, tooShort } = {}) {
  if (value === '') return `${label} is required.`;
  if (value.length < min) return tooShort ?? `${label} is too short.`;
  if (value.length > max) return `${label} is too long (up to ${max} characters).`;
  if (CONTROL_CHARACTERS.test(value)) return `${label} contains characters that are not allowed.`;
  return '';
}

/** Whitespace-tidied copy of the form values, as it will be sent to the server. */
export function tidyDelivery(values) {
  const out = {};
  for (const key of Object.keys(EMPTY_DELIVERY)) out[key] = tidy(values[key]);
  return out;
}

/** @returns {Record<string, string>} field -> message; empty when everything is valid */
export function validateDelivery(values) {
  const v = tidyDelivery(values);
  const errors = {};
  const set = (field, message) => {
    if (message) errors[field] = message;
  };

  set('recipientName', checkText(v.recipientName, 'Recipient name', { min: 2, max: 100, tooShort: 'Enter the recipient’s full name.' }));
  if (!errors.recipientName && !/\p{L}/u.test(v.recipientName)) errors.recipientName = 'Enter the recipient’s full name.';

  const phone = v.phone.replace(/[\s().-]/g, '');
  if (phone === '') errors.phone = 'Phone number is required.';
  else if (!/^\+?[0-9]{10,15}$/.test(phone)) {
    errors.phone = 'Enter a valid phone number, for example 9876543210 or +91 98765 43210.';
  }

  set('addressLine1', checkText(v.addressLine1, 'Address', { min: 3, max: 150, tooShort: 'Enter the house number and street.' }));
  if (v.addressLine2.length > 150) errors.addressLine2 = 'Address line 2 is too long (up to 150 characters).';
  else if (CONTROL_CHARACTERS.test(v.addressLine2)) errors.addressLine2 = 'Address line 2 contains characters that are not allowed.';

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
  return errors;
}

/** Saved delivery (from the API, nulls for empty) -> form values. */
export function deliveryToForm(delivery) {
  return { ...EMPTY_DELIVERY, ...Object.fromEntries(Object.entries(delivery ?? {}).map(([k, v]) => [k, v ?? ''])) };
}

/** Lines of an address for display, skipping empty parts. */
export function addressLines(d) {
  return [d.addressLine1, d.addressLine2, `${d.city}, ${d.state} ${d.postalCode}`.trim(), d.country].filter(Boolean);
}
