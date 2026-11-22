# Notifications

## Responsibility

Tells customers what happened to their order: an order summary after the order is placed, a notice when it is cancelled. "Sending" is faked: the message is stored in this module's schema and can be read back over HTTP.

## Owner

Instructor.

## Internal architecture

Thin event reactions: two `@EventsHandler` classes named as policies do the work directly (store the message, publish the result event). No command layer, no aggregate. Why: Notifications is a generic context and each reaction is a single step, so anything more would be ceremony.

Chaos convention: the first line of every reaction, in every module, is `this.chaos.maybeFail('<PolicyName>')`, so the failure-injection demo works anywhere. A thrown error is reported on the unhandled-exception bus and the app keeps running.

## Events emitted

- `OrderSummarySent`
- `CancellationNoticeSent`

Both are published after the message is stored.

## Events consumed

- `OrderPlaced`
- `OrderCancelled`

## Policies

- `SendOrderSummaryPolicy`: on `OrderPlaced`, store a message to `customerEmail`, then emit `OrderSummarySent`.
- `SendCancellationNoticePolicy`: on `OrderCancelled`, store a notice, then emit `CancellationNoticeSent`. `OrderCancelled` has no email, so the recipient is the address stored for that order's summary. If this module never saw the order, the notice is stored with `to = null` (simplest option; no other module is queried).

## Public queries

None.

## HTTP

- `GET /notifications`: sent messages, newest first.
