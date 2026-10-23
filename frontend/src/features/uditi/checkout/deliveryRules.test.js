import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDelivery, errorsFromDetails, firstInvalidField, toFormValues, validateDelivery } from './deliveryRules.js';
// The server-side rules - the browser and the server must always agree.
import { parseDeliveryDetails } from '../../../../../backend/src/features/uditi/checkout/checkout.validation.js';

const valid = (overrides = {}) => ({
  recipientName: 'Asha Verma',
  phone: '98765 43210',
  addressLine1: '12 MG Road',
  addressLine2: 'Flat 4B',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'India',
  ...overrides,
});

describe('validateDelivery', () => {
  it('accepts good details and tidies them', () => {
    const { errors, clean } = validateDelivery(valid({ recipientName: '  Asha   Verma ', phone: '+91 (98765) 43-210', addressLine2: '   ' }));
    assert.deepEqual(errors, {});
    assert.deepEqual(clean, valid({ recipientName: 'Asha Verma', phone: '+919876543210', addressLine2: null }));
  });

  it('asks for every empty field, in plain language', () => {
    const { errors } = validateDelivery(emptyDelivery({ country: '' }));
    assert.deepEqual(errors, {
      recipientName: 'Recipient name is required.',
      phone: 'Phone number is required.',
      addressLine1: 'Address is required.',
      city: 'City is required.',
      state: 'State is required.',
      postalCode: 'Postal code is required.',
      country: 'Country is required.',
    });
  });

  it('starts with India as the country so most people have one field fewer to fill in', () => {
    assert.equal(emptyDelivery().country, 'India');
  });

  it('checks PIN codes for India and a looser format elsewhere', () => {
    assert.match(validateDelivery(valid({ postalCode: '56003' })).errors.postalCode, /6-digit PIN/);
    assert.deepEqual(validateDelivery(valid({ country: 'United Kingdom', postalCode: 'SW1A 1AA', state: 'England', city: 'London' })).errors, {});
  });

  it('is happy with the optional second address line left empty', () => {
    assert.deepEqual(validateDelivery(valid({ addressLine2: '' })).errors, {});
  });
});

describe('browser and server rules agree', () => {
  const cases = [
    valid(),
    valid({ addressLine2: '' }),
    valid({ recipientName: '  Asha   Verma ', phone: '+91 (98765) 43-210', addressLine2: '   ' }),
    {},
    emptyDelivery(),
    valid({ recipientName: 'A' }),
    valid({ recipientName: '12345' }),
    valid({ recipientName: 'x'.repeat(101) }),
    valid({ phone: '12345' }),
    valid({ phone: '98765abcde' }),
    valid({ phone: '+1 (415) 555-0132' }),
    valid({ phone: '9'.repeat(16) }),
    valid({ postalCode: '56003' }),
    valid({ postalCode: '060001' }),
    valid({ country: 'in', postalCode: '110001' }),
    valid({ country: 'United Kingdom', postalCode: 'SW1A 1AA' }),
    valid({ country: 'United Kingdom', postalCode: '!!' }),
    valid({ addressLine1: 'ab' }),
    valid({ addressLine1: 'x'.repeat(151) }),
    valid({ addressLine2: 'x'.repeat(151) }),
    valid({ city: 'Beng\u0007aluru' }),
    valid({ city: 'B' }),
    valid({ state: 42 }),
    valid({ city: '   ', state: '' }),
    valid({ country: '' }),
    valid({ postalCode: '1'.repeat(13) }),
  ];

  cases.forEach((input, index) => {
    it(`case ${index + 1}: ${JSON.stringify(input).slice(0, 70)}`, () => {
      const browser = validateDelivery(input);
      let server;
      try {
        server = { clean: parseDeliveryDetails(input), errors: {} };
      } catch (error) {
        server = { errors: Object.fromEntries(error.details.map(detail => [detail.field, detail.message])) };
      }
      assert.deepEqual(browser.errors, server.errors);
      if (!server.errors || Object.keys(server.errors).length === 0) assert.deepEqual(browser.clean, server.clean);
    });
  });
});

describe('form helpers', () => {
  it('fills the form from saved details, a suggestion, or nothing', () => {
    assert.deepEqual(toFormValues({ ...valid(), addressLine2: null }), valid({ addressLine2: '' }));
    assert.deepEqual(toFormValues(null, { recipientName: 'Asha Rao', phone: '9876543210' }), emptyDelivery({ recipientName: 'Asha Rao', phone: '9876543210' }));
    assert.deepEqual(toFormValues(null, null), emptyDelivery());
  });

  it('maps the server’s field problems onto the form and finds the first bad field', () => {
    const errors = errorsFromDetails([{ field: 'city', message: 'City is required.' }, { field: 'phone', message: 'Bad phone.' }, { field: 'nonsense', message: 'x' }, { field: 'city', message: 'second' }]);
    assert.deepEqual(errors, { city: 'City is required.', phone: 'Bad phone.' });
    assert.equal(firstInvalidField(errors), 'phone');
    assert.equal(firstInvalidField({}), undefined);
    assert.deepEqual(errorsFromDetails(undefined), {});
  });
});
