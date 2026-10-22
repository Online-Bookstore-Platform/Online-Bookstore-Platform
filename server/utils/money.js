'use strict';

/*
 * Money is added up in whole paise (integer cents) and converted back only for
 * display, because 0.1 + 0.2 !== 0.3 in floating point. Prices come from MySQL
 * DECIMAL(10,2) columns, so every price has at most two decimals.
 */

function toCents(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new TypeError(`not a money amount: ${amount}`);
  return Math.round(amount * 100);
}

function fromCents(cents) {
  if (!Number.isInteger(cents)) throw new TypeError(`not a whole number of cents: ${cents}`);
  return cents / 100;
}

/** Price x quantity, exact to the paisa. */
function lineTotal(unitPrice, quantity) {
  return fromCents(toCents(unitPrice) * quantity);
}

/** Sum of amounts, exact to the paisa. */
function sum(amounts) {
  return fromCents(amounts.reduce((total, amount) => total + toCents(amount), 0));
}

module.exports = { toCents, fromCents, lineTotal, sum };
