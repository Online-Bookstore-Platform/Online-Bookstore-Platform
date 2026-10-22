// Display settings shared by the whole front end.
export const LOCALE = 'en-IN';
export const CURRENCY = 'INR';

/** Books shown per page in the catalogue. */
export const PAGE_SIZE = 12;

/** Base URL of the REST API. Empty = same origin (dev proxy / reverse proxy). */
export const API_BASE_URL = import.meta.env?.VITE_API_URL ?? '';

/** Where the customer goes after the checkout summary (the payment module, issue #8). */
export const PAYMENT_PATH = '/payment';

/** Where the customer edits the cart (the cart module, issue #6). */
export const CART_PATH = '/cart';

/** Country pre-filled in the delivery form. */
export const DEFAULT_COUNTRY = 'India';
