# Checkout

## Responsibility

Owns the cart and the order lifecycle: collecting items, checking out, placing the order, marking it paid or cancelling it. Answers the public order summary query for other modules.

## Owner

Team A.

## Internal architecture

Event-sourced `Order`, state-based `Cart`, both as plain domain classes (`domain/`) behind thin application commands (`application/`) and Drizzle repositories (`infrastructure/`).

- **Order** is event-sourced: its state is never stored, only its history in `checkout.events`. Loading replays the stream; a command checks the rules and records new events, appended after the version it was loaded at (a unique `(stream, version)` index stops two concurrent writers; the loser reloads and retries). Stored events carry the contract's name and may carry more than its fields (`OrderCreated` keeps the lines and email); publishing keeps only the contract's fields.
- **Cart** is short-lived with few rules, so it is ordinary rows (`carts`, `cart_lines`), changed under a row lock.
- **Publishing.** `checkout.events` is also the outbox: every event Checkout emits, cart events included, is appended in the transaction that causes it and published right after the commit, in the same request. Rows still unpublished after 5 s (the process died in between) are published by a sweeper, so events are delivered at least once and never lost.
- `GetOrderSummary` replays the stream on every call, so its answer is never stale.
- Repeating a command that already happened records nothing: events from other modules can arrive more than once.

Why: Checkout is the core context and owns the order lifecycle every other module reacts to. Event sourcing makes the order's states exactly its contract events, and the event store doubles as the outbox, so a committed order change can never lose its event. The cart gets no such care because nothing downstream depends on its history.

## Events emitted

- `ItemAddedToCart`
- `ItemRemovedFromCart`
- `CartCheckedOut`
- `OrderCreated`
- `OrderPlaced`
- `OrderPaid`
- `OrderCancelled`

## Events consumed

- `CartCheckedOut` (its own event, creates the order)
- `PaymentSucceeded`
- `StockReservationFailed`

## Policies

Every reaction calls `ChaosService.maybeFail('<PolicyName>')` first, before doing its work.

- `CreateOrderPolicy` (on `CartCheckedOut`): creates the order under the id the checkout stored on the cart.
- `MarkOrderPaidPolicy` (on `PaymentSucceeded`): placed -> paid. A payment for an order that is already cancelled is ignored and logged as a warning (no refund process exists yet).
- `CancelOrderPolicy` (on `StockReservationFailed`): created or placed -> cancelled, reason `out of stock: <sku>`. An order that is already paid is not cancelled; this is logged as a warning.

## Public queries

- `GetOrderSummary` -> `OrderSummary | null`

Asks `GetProduct` (answered by Catalog) for item prices.

## HTTP

- `POST /carts/:cartId/items` `{ sku, quantity }` -> 201 (404 unknown product, 409 discontinued product or cart already checked out)
- `DELETE /carts/:cartId/items/:sku` -> 204 (404 when the cart or the item is not there)
- `POST /carts/:cartId/checkout` `{ customerEmail }` -> 201 `{ orderId }`. Prices are frozen here, from `GetProduct`. The order appears (status `created`) once `CreateOrderPolicy` has run. 409 for an empty cart, an unavailable product or a second checkout.
- `POST /orders/:orderId/place` -> 202 (409 unless the order is `created` or already `placed`)
- `GET /orders/:orderId` -> `OrderSummary` (404 for an unknown order)
