# Checkout

## Responsibility

Owns the cart and the order lifecycle: collecting items, checking out, placing the order, marking it paid or cancelling it. Answers the public order summary query for other modules.

## Owner

Team A.

## Internal architecture

`Cart` and `Order` are domain aggregates that own cart changes and order state transitions.
NestJS services coordinate them and use Drizzle transactions in the `checkout` schema, so checking
out a cart and creating its order succeed or fail together even with concurrent requests.

## Events emitted

- `ItemAddedToCart`
- `ItemRemovedFromCart`
- `CartCheckedOut`
- `OrderCreated`
- `OrderPlaced`
- `OrderPaid`
- `OrderCancelled`

## Events consumed

- `CartCheckedOut` (handled within Checkout's transaction)
- `PaymentSucceeded`
- `StockReservationFailed`

## Policies

Every reaction calls `ChaosService.maybeFail('<PolicyName>')` first, before doing its work.

- `CreateOrderPolicy` receives `CartCheckedOut` locally and creates the order in the same transaction
  as the cart closure. Checkout publishes `CartCheckedOut` and `OrderCreated` after commit.
- `MarkOrderPaidPolicy` (on `PaymentSucceeded`)
- `CancelOrderPolicy` (on `StockReservationFailed`)

Only a placed order can become paid or cancelled. For order state changes, Checkout publishes
events after the transaction commits. A repeated event that no longer applies leaves the order as is.

## Public queries

- `GetOrderSummary` -> `OrderSummary | null`

Asks `GetProduct` (answered by Catalog) at checkout. The order keeps the quoted prices and total.

## HTTP

- `POST /carts/:cartId/items` `{ sku, quantity }` -> 201
- `DELETE /carts/:cartId/items/:sku` -> 204
- `POST /carts/:cartId/checkout` `{ customerEmail }` -> 201 `{ orderId }`
- `POST /orders/:orderId/place` -> 202
- `GET /orders/:orderId` -> `OrderSummary` (404 for an unknown order)

Adding the same SKU increases its quantity. Checkout requires a non-empty cart with sellable
products and closes it to further edits. Retrying checkout on the same cart returns the existing
order ID.
