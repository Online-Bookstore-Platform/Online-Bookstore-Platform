import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_DELIVERY, addressLines, deliveryToForm, tidyDelivery, validateDelivery } from './delivery.js';

const valid = {
  recipientName: 'Asha Rao',
  phone: '98765 43210',
  addressLine1: '12, 4th Cross, Indiranagar',
  addressLine2: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560038',
  country: 'India',
};

describe('validateDelivery', () => {
  it('accepts a complete Indian address', () => {
    assert.deepEqual(validateDelivery(valid), {});
  });

  it('asks for every required field when the form is empty', () => {
    assert.deepEqual(validateDelivery(EMPTY_DELIVERY), {
      recipientName: 'Recipient name is required.',
      phone: 'Phone number is required.',
      addressLine1: 'Address is required.',
      city: 'City is required.',
      state: 'State is required.',
      postalCode: 'Postal code is required.',
      country: 'Country is required.',
    });
  });

  it('treats whitespace-only text as empty', () => {
    assert.equal(validateDelivery({ ...valid, city: '    ' }).city, 'City is required.');
  });

  it('checks names, phones and PIN codes', () => {
    assert.equal(validateDelivery({ ...valid, recipientName: 'A' }).recipientName, 'Enter the recipient’s full name.');
    assert.equal(validateDelivery({ ...valid, recipientName: '12345' }).recipientName, 'Enter the recipient’s full name.');
    assert.match(validateDelivery({ ...valid, phone: '12345' }).phone, /valid phone number/);
    assert.match(validateDelivery({ ...valid, phone: '98765abcde' }).phone, /valid phone number/);
    assert.equal(validateDelivery({ ...valid, phone: '+91 (98765) 43-210' }).phone, undefined);
    assert.match(validateDelivery({ ...valid, postalCode: '56003' }).postalCode, /6-digit PIN code/);
    assert.match(validateDelivery({ ...valid, postalCode: '060001' }).postalCode, /6-digit PIN code/);
  });

  it('uses a generic postal-code rule outside India', () => {
    const uk = { ...valid, country: 'United Kingdom', postalCode: 'SW1A 1AA' };
    assert.deepEqual(validateDelivery(uk), {});
    assert.equal(validateDelivery({ ...uk, postalCode: '!!' }).postalCode, 'Enter a valid postal code.');
  });

  it('enforces the length limits', () => {
    assert.match(validateDelivery({ ...valid, addressLine1: 'x'.repeat(151) }).addressLine1, /too long/);
    assert.match(validateDelivery({ ...valid, addressLine2: 'x'.repeat(151) }).addressLine2, /too long/);
  });
});

describe('helpers', () => {
  it('tidies whitespace and fills missing keys', () => {
    const tidy = tidyDelivery({ recipientName: '  Asha   Rao ', city: 'X' });
    assert.equal(tidy.recipientName, 'Asha Rao');
    assert.equal(tidy.phone, '');
  });

  it('turns a saved delivery into form values (null -> empty text)', () => {
    assert.equal(deliveryToForm({ ...valid, addressLine2: null }).addressLine2, '');
    assert.deepEqual(deliveryToForm(null), EMPTY_DELIVERY);
  });

  it('lays out an address for display', () => {
    assert.deepEqual(addressLines({ ...valid, addressLine2: 'Near the metro' }), [
      '12, 4th Cross, Indiranagar',
      'Near the metro',
      'Bengaluru, Karnataka 560038',
      'India',
    ]);
    assert.equal(addressLines(valid).length, 3);
  });
});
