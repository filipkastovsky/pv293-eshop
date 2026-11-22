# Fulfilment

## Responsibility

Packs paid orders: creates a shipment for every order that has been paid.

Fulfilment has no command of its own, so its first milestone is M3 (reacting to `OrderPaid`).

## Owner

Team B.

## Internal architecture

**A single event reaction plus a table.** `PackOrderPolicy` reacts to `OrderPaid` by inserting a row into `shipment` and publishing `OrderPacked`; `ShipmentsController` reads that table, and there is nothing else. Why: packing is one step with one rule (one shipment per order); any more structure would have no content.

- The primary key on `order_id` makes a duplicate `OrderPaid` a no-op: no second shipment, no second `OrderPacked`.

## Events emitted

- `OrderPacked`

## Events consumed

- `OrderPaid`

## Policies

Every reaction calls `ChaosService.maybeFail('<PolicyName>')` first, before doing its work.

- `PackOrderPolicy` (on `OrderPaid`)

## Public queries

None.

## HTTP

- `GET /shipments/:orderId` -> `{ orderId, shipmentId, status }`
