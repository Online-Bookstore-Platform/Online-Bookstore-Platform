import { CURRENCY, LOCALE } from '../config.js';

const whole = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
const withPaise = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2 });

/** 299 -> "₹299", 299.5 -> "₹299.50" */
export function formatPrice(amount) {
  return Number.isInteger(amount) ? whole.format(amount) : withPaise.format(amount);
}

/** "1 book", "25 books" */
export function pluralise(count, singular, plural = `${singular}s`) {
  return `${count.toLocaleString(LOCALE)} ${count === 1 ? singular : plural}`;
}
