# Inventory

## Responsibility

Owns stock levels per SKU: receiving stock, reserving it for placed orders and releasing it when an order is cancelled.

`onHand` is the physical stock on the shelf: reserving does not decrement it. `reserved` is the quantity held for placed orders. Available stock is `onHand - reserved`.

## Owner

Team B.

## Internal architecture

TODO: your team decides — write the style and why.

## Events emitted

- `StockReceived`
- `StockReserved`
- `StockReservationFailed`
- `StockReleased`

## Events consumed

- `OrderPlaced`
- `OrderCancelled`

## Policies

Every reaction calls `ChaosService.maybeFail('<PolicyName>')` first, before doing its work.

- `ReserveStockPolicy` (on `OrderPlaced`)
- `ReleaseStockPolicy` (on `OrderCancelled`)

## Public queries

None.

## HTTP

- `POST /inventory/:sku/receive` `{ quantity }`
- `GET /inventory` -> `{ sku, onHand, reserved }[]`
