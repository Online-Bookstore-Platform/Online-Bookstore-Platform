import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProfilePatch, parseRegistration } from '../../src/features/vrinda/registration-profile/registration.validation.js';

test('registration normalizes account values and requires accepted terms', () => {
  const result = parseRegistration({
    name: '  Vrinda   Venugopal ',
    email: ' VRINDA@example.com ',
    password: 'reading-password',
    confirmPassword: 'reading-password',
    phone: '',
    acceptedTerms: true,
  });

  assert.deepEqual(result, {
    name: 'Vrinda Venugopal',
    email: 'vrinda@example.com',
    password: 'reading-password',
    phone: null,
  });
});

test('registration reports invalid email, password mismatch, and missing terms', () => {
  assert.throws(
    () => parseRegistration({ name: 'V', email: 'not-an-email', password: 'short', confirmPassword: 'different' }),
    error => {
      assert.equal(error.status, 400);
      assert.deepEqual(error.details.map(problem => problem.field), ['name', 'email', 'password', 'confirmPassword', 'acceptedTerms']);
      return true;
    }
  );
});

test('profile updates accept only editable fields and normalize email', () => {
  assert.deepEqual(parseProfilePatch({ name: '  Vrinda   Venugopal ', email: 'VRINDA@example.com', phone: '' }), {
    name: 'Vrinda Venugopal',
    email: 'vrinda@example.com',
    phone: null,
  });
  assert.throws(() => parseProfilePatch({ role: 'admin' }), error => error.status === 400);
});
