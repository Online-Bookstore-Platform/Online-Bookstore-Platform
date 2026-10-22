'use strict';

const { z } = require('zod');

/** Collapse runs of whitespace (including line breaks) into single spaces. */
const tidy = (value) => value.replace(/\s+/g, ' ').trim();
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/** A required single-line text field with plain-language messages. */
function text(label, { min = 1, max, minMessage } = {}) {
  return z
    .string({ error: `${label} is required.` })
    .transform(tidy)
    .pipe(
      z
        .string()
        .min(1, `${label} is required.`)
        .min(min, minMessage ?? `${label} is too short.`)
        .max(max, `${label} is too long (up to ${max} characters).`)
        .refine((value) => !CONTROL_CHARACTERS.test(value), `${label} contains characters that are not allowed.`)
    );
}

const isIndia = (country) => /^(india|in|bharat)$/i.test(country);

/** Delivery information entered at checkout (SRS 5.4). */
const deliveryBody = z
  .object({
    recipientName: text('Recipient name', { min: 2, max: 100, minMessage: 'Enter the recipient’s full name.' }).refine(
      (value) => /\p{L}/u.test(value),
      'Enter the recipient’s full name.'
    ),
    phone: z
      .string({ error: 'Phone number is required.' })
      .transform((value) => value.replace(/[\s().-]/g, ''))
      .pipe(
        z
          .string()
          .min(1, 'Phone number is required.')
          .regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number, for example 9876543210 or +91 98765 43210.')
      ),
    addressLine1: text('Address', { min: 3, max: 150, minMessage: 'Enter the house number and street.' }),
    addressLine2: z
      .string({ error: 'Address line 2 must be text.' })
      .transform(tidy)
      .pipe(
        z
          .string()
          .max(150, 'Address line 2 is too long (up to 150 characters).')
          .refine((value) => !CONTROL_CHARACTERS.test(value), 'Address line 2 contains characters that are not allowed.')
      )
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    city: text('City', { min: 2, max: 80 }),
    state: text('State', { min: 2, max: 80 }),
    postalCode: text('Postal code', { max: 12 }),
    country: text('Country', { min: 2, max: 60 }),
  })
  .superRefine((value, ctx) => {
    const { country, postalCode } = value;
    if (!country || !postalCode) return; // already reported as missing
    if (isIndia(country)) {
      if (!/^[1-9][0-9]{5}$/.test(postalCode)) {
        ctx.addIssue({ code: 'custom', path: ['postalCode'], message: 'Enter a 6-digit PIN code, for example 560001.' });
      }
    } else if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,10}[A-Za-z0-9]$/.test(postalCode)) {
      ctx.addIssue({ code: 'custom', path: ['postalCode'], message: 'Enter a valid postal code.' });
    }
  });

module.exports = { deliveryBody };
