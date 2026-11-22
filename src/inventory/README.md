# Inventory

## Responsibility

Owns stock levels per SKU: receiving stock, reserving it for placed orders and releasing it when an order is cancelled.

`onHand` is the physical stock on the shelf: reserving does not decrement it. `reserved` is the quantity held for placed orders. Available stock is `onHand - reserved`.

## Owner

Team B.

## Internal architecture

**Transaction scripts in one service.** `InventoryService` has one method per use case (`receive`, `reserve`, `release`, `list`); each is one database transaction over the `stock` and `reservation` tables, followed by its event. Why: the rules are a few arithmetic checks on two tables, which a row lock and a unique key express directly; aggregates and repositories would add ceremony without adding safety.

- `reserve` is all lines or nothing. It first claims the order's `reservation` row (primary key `order_id`), so a duplicate `OrderPlaced` does nothing, then locks the stock rows and checks `onHand - reserved` per line.
- `release` gives back only what the order still holds and emits `StockReleased` only then.

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
