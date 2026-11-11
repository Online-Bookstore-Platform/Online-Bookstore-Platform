# Order lifecycle

Payment and fulfilment are stored independently on `orders`. Online orders
begin `pending` / `pending`; successful, verified payment moves payment status
to `succeeded` and fulfilment to `confirmed`. COD begins
`pending_collection` / `pending_collection` and cannot become collected until
the order is delivered.

Administrators progress orders through `confirmed → processing → packed →
shipped → out_for_delivery → delivered`. A cancellation is allowed before
shipping when a prepaid payment has not succeeded, or for COD. Each transition
is validated server-side and appended to `order_status_history`; the customer
tracking API reads this history from MySQL on every page load.

COD deducts and reserves stock at order placement. For online demo payment, no
order exists before Gmail OTP verification. On successful verification, current
cart stock is rechecked and inventory is deducted in the same transaction that
creates the order and records simulated success. Incorrect or expired codes
leave cart and inventory unchanged. Eligible COD cancellation restores the
reservation in the same transaction as the status/history update. Order item
title and price remain snapshots.

Admin APIs are under `/api/admin/orders`; customer order reads remain scoped by
authenticated user ID.
