# 0004. Each module owns its data

- Status: accepted
- Date: 2026-11-22
- Deciders: PV293 instructor

## Context and Problem Statement

Module borders in the code (0003) mean little if the data underneath is shared. When two modules
read and write the same tables, a column rename in one breaks the other, a migration needs both
teams, and the modules can never be separated: they deploy together and fail together. This is
the distributed monolith from Seminar 05, only inside one process. We have to decide how data is
split between modules.

## Decision Drivers

- a team can change its own tables and migrations without coordinating with the other team
- no module can read or change another module's data except through that module's contracts
- running cost and operational load stay at one database for the whole system (0002)
- a module can later take its data with it when it becomes a service

## Considered Options

- One database, one schema per module
- One shared schema, table ownership by convention
- One database per module

### Option A — Schema per module

- Good: ownership is visible in the database itself; every table lives in its module's schema
- Good: each module migrates its own schema on its own, so two teams never edit one migration history
- Good: one database to run, back up and pay for
- Bad: nothing in the database stops a cross-schema join; the rule is kept by review and by the module border in code
- Bad: still one database: a heavy query in one module slows the others

### Option B — Shared schema, ownership by convention

- Good: the simplest setup; joins across modules are one query away
- Bad: one query away is exactly the problem; coupling grows quietly until the modules cannot be separated
- Bad: one migration history for all teams, conflicting on every parallel change

### Option C — Database per module

- Good: the strongest isolation; a module's data is physically its own
- Bad: six databases to provision, back up and connect to, for two teams and one small lab
- Bad: buys isolation the deployment model (0002) cannot use yet

## Decision Outcome

Chosen: **Option A**. Rules:

- each module owns exactly one schema, named after the module, and is its only reader and writer
- no joins, foreign keys or views across schemas
- data another module needs is obtained through that module's contracts (0005): a public query
- each module manages its own migrations, recorded inside its own schema

## Consequences

- Good: splitting a module into a service later means moving one schema, not untangling tables
- Good: a team's migration can never block the other team's release
- Bad: no cross-module joins; reports spanning modules need a query per module
- Bad: identifiers shared between modules (order id, SKU) have no foreign key to protect them; consistency is the contracts' job
- Neutral: the platform keeps its own schema for cross-cutting data (the order timeline), under the same rules
- Revisit if any of these is observed:
  - one module's queries or migrations slow down or lock the other modules' schemas
  - a module moves out of process and needs its own database
  - a cross-module view is needed that a query per module cannot answer fast enough

## Links

- Related: [0002](0002-modular-monolith-one-deployable.md), [0003](0003-module-borders-follow-bounded-contexts.md), [0005](0005-integration-through-contracts.md)
- PV293 Seminar 05, "The trap in the middle" (distributed monolith)
