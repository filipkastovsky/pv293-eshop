# Fulfilment

## Responsibility

Packs paid orders: creates a shipment for every order that has been paid.

Fulfilment has no command of its own, so its first milestone is M3 (reacting to `OrderPaid`).

## Owner

Team B.

## Internal architecture

TODO: your team decides — write the style and why.

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
