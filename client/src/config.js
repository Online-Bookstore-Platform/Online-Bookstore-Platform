// Display settings shared by the whole front end.
export const LOCALE = 'en-IN';
export const CURRENCY = 'INR';

/** Books shown per page in the catalogue. */
export const PAGE_SIZE = 12;

/** Base URL of the REST API. Empty = same origin (dev proxy / reverse proxy). */
export const API_BASE_URL = import.meta.env?.VITE_API_URL ?? '';
