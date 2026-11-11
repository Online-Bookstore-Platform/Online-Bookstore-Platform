# Simulated payment with Gmail OTP

Folio does not integrate with Razorpay, Cashfree, Stripe, or another payment
provider. The online payment choices (card, UPI, and net banking) are for the
college-project demonstration interface only. The app does not request card
numbers, CVVs, UPI PINs, bank passwords, or perform a financial transaction.

Configure `EMAIL_FROM`, `GMAIL_USER`, and `GMAIL_APP_PASSWORD` in
`backend/.env`. Use a Google App Password. On **Proceed to Pay**, the backend
sends a six-digit cryptographically generated OTP to the signed-in user's
registered email. It stores an HMAC hash, enforces five-minute expiry, five
attempts, single-use verification, and a 60-second resend cooldown. The API
response and logs never contain the code.

An online order does not exist before the code is verified. OTP verification,
cart/price/stock revalidation, inventory deduction, order creation, successful
simulated payment recording, order confirmation, and cart clearing share one
database transaction. Invalid, expired, or exhausted codes create no order and
do not alter inventory. A duplicate successful submission returns the same
order idempotently.

Cash on Delivery remains a separate flow. It creates an order at checkout and
keeps `payment_status` as `pending_collection` until collection is recorded.
