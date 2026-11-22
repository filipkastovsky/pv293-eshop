# 0003. Module borders follow the bounded contexts, enforced by lint

- Status: accepted
- Date: 2026-11-22
- Deciders: PV293 instructor

## Context and Problem Statement

The bounded contexts were found in an event storming session (PV293 Seminar 03; the board is kept
as a dated snapshot in `docs/event-storming/`). The board is a workshop artifact with its own
lifecycle: it is redrawn in the next session, or goes stale. The contexts it revealed are the
model; the board is only where they were first written down.

Inside one deployable (0002), nothing physical stops one part of the code from reaching into
another. If any file can import any other, the borders survive only until the first
deadline, and the monolith becomes a big ball of mud that can never be split. We have to decide
where the module borders go and what keeps them in place.

## Decision Drivers

- every term of the ubiquitous language belongs to exactly one module
- one team can change the inside of its module without coordinating with the other team
- a border violation is caught by a machine, before review, not by a reviewer's memory
- a module can later be lifted out into its own service without untangling imports

## Considered Options

- One module per bounded context
- One module per aggregate
- Modules by technical layer (controllers, services, repositories)

### Option A — One module per bounded context

- Good: the context map is the map of the code; a context's language stays inside its module
- Good: contexts are what the business changes together, so most changes stay inside one module
- Bad: contexts differ a lot in size; Checkout (Cart and Order) is much bigger than Notifications
- Bad: contexts are discovered, not fixed; when the model changes, module borders have to move, and moving code costs more than moving stickies

### Option B — One module per aggregate

- Good: small, very focused modules
- Bad: Cart and Order share one language and one team, but would talk through contracts as if they were strangers
- Bad: twice as many borders to maintain, most of them inside one context

### Option C — Modules by technical layer

- Good: familiar from the first NestJS project (Seminar 00); every file has an obvious folder
- Bad: every feature touches every layer, so every change crosses every border
- Bad: the bounded contexts disappear from the code; nothing can ever be split out along them

## Decision Outcome

Chosen: **Option A**. Modules: `catalog`, `checkout`, `inventory`, `fulfilment`, `payment`,
`notifications`. Contexts identified but not built yet (Promotions, Identity, Billing, Reviews,
Loyalty, Returns) get no module until they are built.

From here on the code and `docs/architecture.md` (context map, module READMEs) are the current
model. The board snapshot is history: it is not updated to match the code, and the code is not
required to match it. A new modelling session produces a new snapshot and, if borders move, a new
ADR.

The border is enforced by a static import check that runs in CI and fails the build:

- a module may import its own files, the shared contracts, the platform's public entry point, and libraries
- a module may not import anything from another module
- the contracts import nothing from the application; the platform imports only the contracts

The tool is an implementation detail, documented in the repository README.

Alternatives for enforcement: review only (rejected: not machine-checked), or one package per
module with an explicit public entry point (strongest, but adds build tooling before it is needed;
revisit when modules are split out).

## Consequences

- Good: a team can rewrite the inside of its module freely as long as its contracts hold (see 0006)
- Good: lifting a module into a service later starts from a module that already has no foreign imports
- Bad: sharing a small helper between modules now means putting it in `platform` or duplicating it
- Bad: the lint rule checks imports, not intent; a module can still couple through the shape of an event
- Neutral: Team A owns `checkout`; Team B owns `inventory` and `fulfilment`; ownership is recorded in each module's README, not in the structure
- Revisit if any of these is observed:
  - a new modelling session moves a context's border or splits a context
  - one module is owned by more than one team, or grows parts that change for unrelated reasons

## Links

- Related: [0002](0002-modular-monolith-one-deployable.md), [0005](0005-integration-through-contracts.md), [0006](0006-internal-architecture-per-module.md)
- Event storming snapshot: [docs/event-storming](../event-storming/README.md)
- PV293 Seminar 03, bounded contexts
