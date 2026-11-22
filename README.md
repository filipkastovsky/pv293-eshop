# pv293-eshop

PV293 Software Architectures - e-shop modular monolith.

An online shop built as one NestJS application with six modules, one per bounded context:
Catalog, Checkout, Inventory, Fulfilment, Payment and Notifications. Catalog, Payment and
Notifications are built; Checkout (Team A) and Inventory and Fulfilment (Team B) are built by the
teams. Every green `main` is deployed to the lab cluster once the lab deploy credential is configured.

## Quick start

Requirements: Node.js >= 24.15 (`.nvmrc`; enforced by `engines`) and Docker or Podman.

```bash
docker compose up -d        # PostgreSQL 17 on localhost:5432 (eshop/eshop/eshop); or: podman compose up -d
npm ci
npm run start:dev           # http://localhost:3000, GET /health
```

Checks (all of them run in CI):

```bash
npm run lint                # format, lint and module borders
npm run typecheck
npm run docs:check          # ADRs, ADR index and module READMEs
npm test                    # unit and module tests (need the database)
npm run test:e2e            # black-box tests over HTTP (need the database)
```

Run a single test file:

```bash
npm test -- path/to/file.spec.ts
npm run test:e2e -- test/milestones/inventory.e2e-spec.ts
```

Always go through the npm scripts: bare `npx jest` fails with `ERR_REQUIRE_ESM`, because Nest 12 is
ESM-only and the scripts add `node --experimental-vm-modules`. The resulting VM Modules
`ExperimentalWarning` is expected.

Environment: `DATABASE_URL` (default `postgres://eshop:eshop@localhost:5432/eshop`), `PORT`
(default `3000`), `DEV_ENDPOINTS` (`true` enables `/dev/*`).

## The rules in five lines

1. One module per bounded context, in `src/<module>/`; a module never imports another module.
2. Each module owns one database schema; nobody else reads or writes it.
3. Modules talk only through `src/contracts/`: events (facts) and public read-only queries. No cross-module commands.
4. Inside its borders, a module is built however its team decides, as its README says.
5. A structural decision gets an ADR; accepted ADRs are not edited, only superseded.

The full rules for people and coding agents are in [AGENTS.md](AGENTS.md).

## Tools

- **NestJS 12**: one `@Module` per bounded context, plus `src/platform/`.
- **@nestjs/cqrs**: used only for integration between modules: the `EventBus` carries events, the
  `QueryBus` carries public queries. No module is required to use command handlers, sagas or
  aggregates inside.
- **Drizzle ORM + drizzle-kit** on PostgreSQL: each module has its schema in
  `src/<module>/db/schema.ts` and its own migrations, generated with
  `npm run db:generate -- <module>` and applied on start-up.
- **Biome**: formatting, linting and the module border check (`noRestrictedImports` per module in
  `biome.json`), all in `npm run lint`.
- **Jest + supertest**: unit and module tests (`npm test`), black-box end-to-end tests (`npm run test:e2e`).

## Documentation

- [docs/architecture.md](docs/architecture.md): the current architecture (context map, modules, deployment).
- [docs/adr/](docs/adr/README.md): architecture decision records, the reasoning behind it.
- [AGENTS.md](AGENTS.md): the rules, as instructions.
- Module READMEs: [catalog](src/catalog/README.md), [checkout](src/checkout/README.md),
  [inventory](src/inventory/README.md), [fulfilment](src/fulfilment/README.md),
  [payment](src/payment/README.md), [notifications](src/notifications/README.md).
- [docs/event-storming/](docs/event-storming/README.md): the event storming board (a dated snapshot).

## Seeing what happens

- `GET /orders/:orderId/timeline`: every event of one order and every reaction that failed on it,
  in order. Built from events, so it may lag a moment behind.
- With `DEV_ENDPOINTS=true`:
  - `POST /dev/emit/:eventName` with the event payload as the body publishes any event from
    `src/contracts/` (e.g. `POST /dev/emit/OrderPaid` `{ "orderId": "..." }`), so a module can be
    driven without the other team's code.
  - `POST /dev/chaos` `{ "handler": "ReserveStockPolicy" }` makes the next
    `ChaosService.maybeFail('ReserveStockPolicy')` call throw once. An armed handler stays armed
    until it fires or the app restarts.
