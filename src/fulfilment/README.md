# Fulfilment

## Responsibility

Packs paid orders: creates a shipment for every order that has been paid.

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
