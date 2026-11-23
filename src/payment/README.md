# Payment

## Responsibility

Charges the customer for a placed order through an external payment provider and tells the rest of the system whether the charge went through.

## Owner

Instructor.

## Internal architecture

Ports and adapters, plus a transactional outbox.

- `domain/` holds the payment state (`initiated`, `succeeded`, `failed`) with no Nest or database imports. `application/` holds the `PayForOrder` use case and the repository port. `adapters/` holds HTTP, the Drizzle repository and the payment gateway.
- The gateway is a port (`PaymentGateway`) with a fake adapter. The module's main job is to keep an external provider's model out of ours: the provider's vocabulary (`charge`, `succeeded`, `declined`) stays inside `adapters/gateway/`. The use case depends only on the application port `PaymentProvider` (`collect` -> `approved` | `declined`); `GatewayPaymentProvider` is the anti-corruption layer that calls the gateway and translates its answer. Swapping the provider touches one adapter. The fake declines when the amount in cents ends in `13` (e.g. 120.13).
- Events never go straight to the `EventBus`. The use case writes the payment change and an `outbox` row in one database transaction; `OutboxRelay` polls every 500 ms (and is nudged right after each commit), publishes unpublished rows in `created_at` order and then sets `published_at`. Why: a charged card must never lose its event, and an event must never be published for a change that was rolled back. Delivery is at-least-once: a crash between publish and `published_at` republishes the row on restart, so subscribers must tolerate duplicates.
- Each `outbox` row stores the W3C trace context of the request that wrote it (`trace_context`, nullable). The relay runs outside any request, so each row gets a new root span `outbox.relay <EventName>` with a span link (not a parent) to the stored context; publish and handler spans hang below it. A null or malformed context just means no link.
- Flow: transaction 1 inserts the payment and `PaymentInitiated`; the gateway is called outside any transaction; transaction 2 updates the payment and writes `PaymentSucceeded` or `PaymentFailed`.
- At most one live payment per order: a partial unique index on `payments(order_id)` for `initiated`/`succeeded` rows turns a second attempt into `409`. A failed payment may be retried.
- Known gaps: a throwing gateway leaves the payment `initiated` (and so blocks a retry for that order); a poison outbox row (unknown event name) blocks the relay behind it, trading liveness for order; the relay assumes a single instance.

## Events emitted

- `PaymentInitiated`
- `PaymentSucceeded`
- `PaymentFailed` (`reason: 'declined'`)

## Events consumed

None.

## Policies

None.

## Public queries

None answered. Asks `GetOrderSummary` (answered by Checkout); no answer or `null` is treated as an unknown order.

## HTTP

- `POST /orders/:orderId/pay` -> `202`; `409` when the order is unknown, its status is not `placed`, or it already has a live payment
