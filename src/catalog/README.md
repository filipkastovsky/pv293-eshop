# Catalog

## Responsibility

Owns the product list: SKU, name, price and whether a product can still be sold. Other modules learn about changes from events and read a product through a public query.

## Owner

Instructor.

## Internal architecture

Plain create-read-update service. Catalog is a supporting context with almost no rules; anything more would be ceremony.

## Events emitted

- `ProductAdded`
- `PriceChanged`
- `ProductDiscontinued`

Events are published after the database write succeeds. The five seed products are inserted on boot without events.

## Events consumed

None.

## Policies

None.

## Public queries

- `GetProduct` -> `ProductView | null`. `null` for an unknown SKU; a discontinued product is returned with `available: false`.

## HTTP

- `GET /catalog/products`
- `POST /catalog/products` `{ sku, name, price }` (409 when the SKU exists)
- `PATCH /catalog/products/:sku/price` `{ price }`
- `POST /catalog/products/:sku/discontinue`
