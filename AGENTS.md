# Rules for agents (and humans)

This repository is a modular monolith. The architecture is the borders between modules; inside a
module, its owning team decides. Read [docs/architecture.md](docs/architecture.md) and the README
of the module you are changing before you change it.

## Borders

- Never import another module. A module (`src/<module>/`) imports only its own files,
  `src/contracts/**`, `src/platform/index.ts` (the platform's entry point, never its other files)
  and libraries.
- `src/contracts/` imports nothing from the application. `src/platform/` imports only `src/contracts/`.
- Do not create a module for a context that is not being built. Do not move a border without an ADR.
- Change only the modules your task is about. Checkout belongs to Team A, Inventory and Fulfilment to
  Team B, everything else to the instructor.

## Data ownership

- A module reads and writes only its own Postgres schema, named after the module.
- No joins, foreign keys or views across schemas. No SQL that names another module's schema.
- A module manages its own migrations: change `src/<module>/db/schema.ts`, then run
  `npm run db:generate -- <module>`. Never edit another module's migrations, and never edit a
  migration that has already been merged.
- Data from another module comes from that module's public query, never from its tables.

## Contracts

- Modules talk only through `src/contracts/`: events (facts in the past tense, published by the
  module that owns them) and public queries (read-only questions, answered by the module that owns
  the data).
- There are no cross-module commands. To make another module do something, publish what happened
  and let that module react.
- A reaction to another module's event lives in the reacting module, as a policy named
  `<Command>Policy` that runs that module's own command. Never re-publish the incoming event.
- Events carry the data a subscriber needs to act, not only identifiers.
- A query never changes state.
- Do not build a copy of another module's data from its events; ask the owner with its public
  query (reads are strongly consistent).
- Changing an existing event or query is a cross-team change: list every consuming module in the
  pull request and check each of them. Add fields rather than rename or remove them.
- Names come from the ubiquitous language, in PascalCase (`Stock Reserved` -> `StockReserved`).

## Failure injection

- The first line of every reaction to an event, in every module, is
  `this.chaos.maybeFail('<PolicyName>')` (`ChaosService` from `src/platform`), with the policy's
  class name. Nothing comes before it.

## Inside your module

- Follow the **Internal architecture** section of the module's README. If it says `TODO`, the
  owning team has not decided yet: ask, do not invent a style.
- Do not copy another module's internal style because it is there; modules differ on purpose.
- When you change what a module emits, consumes, answers or serves, update its README in the same change.

## Decisions

- An architectural decision (borders, data ownership, what crosses a border, deployment, how
  failures are handled across modules) needs an ADR in `docs/adr/`, written from
  `docs/adr/template.md`. A business rule does not.
- Never edit an accepted ADR's reasoning. Only its status and links may change. To change a
  decision, write a new ADR that supersedes it.
- When a change makes `docs/architecture.md` wrong, fix it in the same change.

## Before proposing a change

- Run `npm run lint && npm run docs:check && npm test` and make them pass. Do not weaken a check,
  skip a test or add a lint ignore to get there.
- The milestone tests in `test/` are the specification. Un-skip a milestone when you start it;
  never change its assertions to make it pass.
