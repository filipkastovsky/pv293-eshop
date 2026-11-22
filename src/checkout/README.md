# Checkout

## Responsibility

Owns the cart and the order lifecycle: collecting items, checking out, placing the order, marking it paid or cancelling it. Answers the public order summary query for other modules.

## Owner

Team A.

## Internal architecture

**Domain model.** Two aggregates, `Cart` and `Order` (`domain/`), own every rule and record the events; command handlers (`application/`, on the in-module `CommandBus`) load one aggregate, call one method, save it with an optimistic version check and publish what it recorded. Why: Checkout is the core of the shop and carries most of its rules (what may happen in which state, how prices and totals are fixed), so they live in one place, testable without the database, while the controller and policies stay thin.

- Checkout asks Catalog for current prices (`GetProduct`) and freezes them into the order lines; `CreateOrderPolicy` then creates the `Order` from `CartCheckedOut`.
- Repeating an order transition that already happened is a no-op without an event, so a duplicate `PaymentSucceeded` pays the order once.

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

- `CreateOrderPolicy` (on `CartCheckedOut`)
- `MarkOrderPaidPolicy` (on `PaymentSucceeded`)
- `CancelOrderPolicy` (on `StockReservationFailed`)

## Public queries

- `GetOrderSummary` -> `OrderSummary | null`

Asks `GetProduct` (answered by Catalog) for item prices.

## HTTP

- `POST /carts/:cartId/items` `{ sku, quantity }` -> 201
- `DELETE /carts/:cartId/items/:sku`
- `POST /carts/:cartId/checkout` `{ customerEmail }` -> 201 `{ orderId }`
- `POST /orders/:orderId/place` -> 202
- `GET /orders/:orderId` -> `OrderSummary` (404 for an unknown order)
