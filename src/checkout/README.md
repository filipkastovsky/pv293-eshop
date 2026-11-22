# Checkout

## Responsibility

Owns the cart and the order lifecycle: collecting items, checking out, placing the order, marking it paid or cancelling it. Answers the public order summary query for other modules.

## Owner

Team A.

## Internal architecture

TODO: your team decides — write the style and why.

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
- `GET /orders/:orderId` -> `OrderSummary`
