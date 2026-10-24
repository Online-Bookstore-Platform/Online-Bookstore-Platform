import { badRequest } from '../shared/errors.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9]{8,15}$/;
const clean = value => value.replace(/\s+/g, ' ').trim();
const normalizePhone = value => value.replace(/[\s().-]/g, '');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireObject(body) {
  if (!isObject(body)) throw badRequest('Send the account details as a JSON object.', [{ field: 'body', message: 'An object is required.' }]);
}

export function parseRegistration(body) {
  requireObject(body);
  const name = typeof body.name === 'string' ? clean(body.name) : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  const phoneText = body.phone == null ? '' : typeof body.phone === 'string' ? body.phone.trim() : null;
  const phone = phoneText === null ? null : normalizePhone(phoneText);
  const errors = [];

  if (name.length < 2 || name.length > 100) errors.push({ field: 'name', message: 'Enter your name (2–100 characters).' });
  if (email.length > 255 || !EMAIL.test(email)) errors.push({ field: 'email', message: 'Enter a valid email address.' });
  if (password.length < 8 || password.length > 200) errors.push({ field: 'password', message: 'Use a password between 8 and 200 characters.' });
  if (confirmPassword !== password) errors.push({ field: 'confirmPassword', message: 'The passwords do not match.' });
  if (phone === null || (phone && !PHONE.test(phone))) errors.push({ field: 'phone', message: 'Enter a valid phone number, or leave it blank.' });
  if (body.acceptedTerms !== true) errors.push({ field: 'acceptedTerms', message: 'Accept the terms to create an account.' });
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors);

  return { name, email, password, phone: phone || null };
}

export function parseProfilePatch(body) {
  requireObject(body);
  const allowed = ['name', 'email', 'phone'];
  const keys = Object.keys(body);
  const errors = [];
  if (keys.length === 0 || keys.some(key => !allowed.includes(key))) {
    errors.push({ field: 'body', message: 'Update one or more of name, email, or phone.' });
  }
  const changes = {};

  if (Object.hasOwn(body, 'name')) {
    const name = typeof body.name === 'string' ? clean(body.name) : '';
    if (name.length < 2 || name.length > 100) errors.push({ field: 'name', message: 'Enter your name (2–100 characters).' });
    else changes.name = name;
  }
  if (Object.hasOwn(body, 'email')) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email.length > 255 || !EMAIL.test(email)) errors.push({ field: 'email', message: 'Enter a valid email address.' });
    else changes.email = email;
  }
  if (Object.hasOwn(body, 'phone')) {
    const phoneText = body.phone == null ? '' : typeof body.phone === 'string' ? body.phone.trim() : null;
    const phone = phoneText === null ? null : normalizePhone(phoneText);
    if (phone === null || (phone && !PHONE.test(phone))) errors.push({ field: 'phone', message: 'Enter a valid phone number, or leave it blank.' });
    else changes.phone = phone || null;
  }
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors);
  return changes;
}
