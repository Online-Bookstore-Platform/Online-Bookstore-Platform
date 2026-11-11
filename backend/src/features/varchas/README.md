# Varchas feature integration

This feature provides authentication, password-reset email OTP, simulated-payment email OTP, book details, and admin routes. `src/server.js` connects the shared MySQL repositories and Gmail SMTP configuration. Missing database or mail dependencies fail closed with HTTP 503.

## Simulated payment

Folio does not connect to a payment provider. The supported online selections are `card`, `upi`, and `netbanking`; they are presentation-only. No card number, CVV, UPI PIN, or banking password is requested. After the customer proceeds, the server sends a six-digit OTP to the email address on the authenticated user record. A five-minute, one-use challenge is stored by keyed hash, allows at most five verification attempts, and enforces a 60-second resend cooldown.

The order service rechecks the authenticated customer's saved delivery, cart, current prices, and stock inside a transaction when the OTP is verified. The same transaction consumes the challenge, deducts inventory, creates the order, records the simulated successful payment, confirms the order, and clears the cart. Invalid, expired, or reused challenges cannot create another order. Repeated submission of a successfully used challenge returns its existing order idempotently.

Configure `EMAIL_FROM`, `GMAIL_USER`, and `GMAIL_APP_PASSWORD` in `backend/.env`. Use a Google App Password. The OTP is never returned by an API or written to logs. Tests inject a mail sink; production uses Gmail SMTP.

## Endpoints

| Method | Path | Access | Contract |
|---|---|---|---|
| POST | `/api/auth/login` | Public, rate limited | Authenticates and creates an HTTP-only server session |
| POST | `/api/auth/logout` | Public | Destroys the current session |
| GET | `/api/auth/me` | Customer or admin | Returns the current public user |
| POST | `/api/auth/forgot-password` | Public, rate limited | Sends a password-reset OTP to a matching account |
| POST | `/api/auth/verify-reset-otp` | Public, rate limited | Verifies reset code and returns a short-lived reset proof |
| POST | `/api/auth/reset-password` | Public, rate limited | Changes password and revokes existing sessions |
| GET | `/api/books/:bookId` | Public | Returns one local book or 404 |
| GET/POST/PATCH/DELETE | `/api/admin/books` | Admin | Catalogue management |
| POST | `/api/payments/otp` | Authenticated customer | Rechecks checkout, then emails a payment OTP for the selected demo method |
| POST | `/api/payments/otp/verify` | Authenticated customer | Consumes OTP and atomically creates a confirmed order and simulated payment |
| POST | `/api/payments/orders/:orderId` | Authenticated | Legacy route returns 410; online order creation requires OTP verification |

Cash on Delivery remains a separate existing checkout option and does not use the payment OTP. See `backend/database/PAYMENTS.md`, `backend/database/ORDER_LIFECYCLE.md`, and `backend/database/migrations/README.md`.
