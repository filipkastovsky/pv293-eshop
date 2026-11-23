# 0008. Recover event handling by business impact

- Status: proposed
- Date: 2026-11-23
- Deciders: Teams A and B and the PV293 instructor

## Context and Problem Statement

Checkout, Inventory, Payment and Fulfilment commit their own state. A failed reaction can leave a
charge without a paid order or a placed order without reserved stock. The same `OrderPlaced` also
triggers an email, whose delay has a different cost.

Today, Nest's in-process event bus reports a thrown handler to `UnhandledExceptionBus` and keeps
dispatching. The platform records the failure as `handler_failed` for order events. Payment commits
its outcome and outbox entry together, but its relay marks a row published after dispatch to the
bus, before it knows whether any handler succeeded. A crash can cause repeated dispatch, and a
handler failure after dispatch can leave the business step undone.

## Decision Drivers

- A committed charge, order or stock change can still reach its required next step after a failure
  or restart. Redelivery produces each business effect at most once.
- Checkout, Inventory, Fulfilment and Payment retain control of their own schemas and failures.
- A delayed email or a broken subscriber does not hold up checkout or other subscribers.
- Operators can identify the affected order and recover a failed reaction with one application
  and PostgreSQL.

## Considered Options

### Option A — Run handlers inside the publisher's transaction

- Good: changes in a single database transaction commit or roll back together. This fits a local
  invariant such as closing a cart and creating its order.
- Bad: across modules, the publisher's success depends on every participating subscriber. The
  transaction would span privately owned schemas and hold locks while subscribers run.
- Bad: rolling back PostgreSQL cannot undo a charge already made at the payment provider.

### Option B — Give every module a transactional outbox and idempotent handlers

- Good: the committed event survives a restart. With per-subscriber completion tracking, the
  relay can redeliver failed reactions without repeating business effects.
- Bad: persistence, retry state, deduplication and monitoring become requirements for every
  event, including ones used only for diagnostics. A relay that records only bus dispatch still
  cannot recover a failed handler.

### Option C — Accept lost deliveries and reconcile periodically

- Good: Postgres holds the authoritative business state. A repair job can recompute eligible work
  even when the original event was never seen.
- Bad: stock reservation or packing can wait until the next pass. A repair job needs a public
  query and enough retained state to distinguish missing work from work that should never run.
  The existing `GetOrderSummary` can look up a known order ID only.

## Decision Outcome

We choose the guarantee for each **event and subscriber pair** based on what happens if the
reaction is lost. Money, stock and shipment transitions require durable delivery. Reconstructable
side effects may wait for a repair pass, and diagnostics use best-effort delivery. A single event
can have required and best-effort subscribers.

| Event and reaction | Delivery and recovery |
| --- | --- |
| `CartCheckedOut` → Checkout `CreateOrderPolicy` | Run the local policy inside Checkout's transaction so the cart closure and order creation commit together. Publish the resulting facts after commit. |
| `OrderPlaced` → Inventory `ReserveStockPolicy`, `StockReservationFailed` → Checkout `CancelOrderPolicy`, and `OrderCancelled` → Inventory `ReleaseStockPolicy` | Persist required deliveries. Retry until they complete or require operator intervention. |
| `PaymentSucceeded` → Checkout `MarkOrderPaidPolicy` and `OrderPaid` → Fulfilment `PackOrderPolicy` | Persist required deliveries. A charged order must reach Checkout and trigger packing, or surface a recoverable failure. |
| `OrderPlaced` → Notifications `SendOrderSummaryPolicy` and `OrderCancelled` → Notifications `SendCancellationNoticePolicy` | Try delivery immediately. Periodically reconcile eligible orders with stored messages and create the missing ones. |
| Events with only diagnostic consumers, such as `OrderCreated`, `PaymentInitiated`, `PaymentFailed`, `StockReserved` and `OrderPacked` | Use best-effort delivery. Read the owning module's state when investigating a gap. Reassess when a business subscriber is added. |

For **required deliveries**, the publisher writes an outbox entry in the same transaction as its
state change. Each entry keeps a stable event ID across attempts. The relay tracks completion per
required subscriber and acknowledges that delivery only after the handler's own transaction has
committed. The platform must observe each required policy's result. A return from
`EventBus.publish` only confirms dispatch. Successful subscribers stay complete when another
subscriber fails. Best-effort subscribers run independently and do not delay completion.

The handler makes redelivery safe using a domain key, such as one shipment per order, or a receipt
keyed by event ID and subscriber. The handler commits the effect and any receipt together in its
own schema. If that effect produces another required event, its outbox entry belongs in the same
transaction. This covers a crash after applying `PaymentSucceeded` but before publishing
`OrderPaid`. An already applied effect completes successfully. A conflicting state, such as a
successful payment for a cancelled order, is recorded for the owning teams to resolve.
Required delivery starts at the publisher's commit. If a provider charge succeeds before Payment
can commit its outcome, Payment needs recovery from the provider's records.

Retry transient failures with backoff. After a bounded number of attempts, retain the failed
delivery and alert with the event ID, order ID and policy name. Operators can requeue that
subscriber with the same event ID after fixing the cause. Delay dependent work for that order
while its prerequisite is pending, and keep processing unrelated orders. The timeline remains
diagnostic. Use outbox and delivery state to recover work. Limit failure logs to identifiers and
policy names.

Notifications owns the periodic repair. It needs a paginated, read-only Checkout query for
committed placements and cancellations, with the data needed to recreate a missing message.
Checkout remains the source for recipients, including when a cancellation arrives before a
summary. Notifications deduplicates by order ID and message kind so a live delivery and a repair
can race safely. The job can resume a pass after a restart and revisits any order whose message
could not be stored. The query and scheduled repair are implementation work under this ADR.

The current implementation has a local checkout transaction and durable publication in Payment.
Per-subscriber acknowledgement and retry, the required outbox entries outside Payment, and
notification repair are proposed changes. Verify recovery by injecting a failure before a handler
commits, interrupting delivery after it commits, and running reconciliation after dropping a
notification delivery.

## Consequences

- Good: failed reservation, cancellation or packing can be recovered without repeating an
  already applied effect or a successful sibling reaction.
- Good: a failed email does not roll back an order or delay its stock reservation.
- Bad: reliable paths add delivery state, replay tooling and idempotency tests. Notifications
  needs a new public query and customers may wait until the next reconciliation pass.
- Bad: Checkout, Inventory and Fulfilment still observe separate commits. A conflict such as a
  charge for a cancelled order can require operator intervention.
- Revisit if a required delivery remains unresolved for an entire lab session, if missed notices
  routinely survive the next reconciliation pass, or if a new subscriber needs a stronger
  guarantee for an event currently used for diagnostics.

## Links

- [Module data ownership](0004-each-module-owns-its-data.md)
- [Events and public queries at module boundaries](0005-integration-through-contracts.md)
- [Critical path and current delivery behavior](../architecture.md)
- [Payment relay](../../src/payment/outbox/outbox.relay.ts) and [timeline recorder](../../src/platform/timeline/timeline.recorder.ts)
- [Checkout cart transaction](../../src/checkout/application/cart.service.ts) and [notification policies](../../src/notifications/README.md)
