# 0002. Modular monolith, one deployable

- Status: accepted
- Date: 2026-11-22
- Deciders: PV293 instructor

## Context and Problem Statement

The e-shop board has six bounded contexts in scope (Catalog, Checkout, Inventory, Fulfilment,
Payment, Notifications). Two small teams build them, and one instructor operates the result on a
small Kubernetes lab. We have to decide how many separately deployable units those contexts
become. A border drawn on the board costs nothing; the same border across a network costs a
transport, retries, a contract that can drift, and somebody to operate it.

## Decision Drivers

- the teams can operate what they build, today, with the people in the room
- the borders between contexts stay real and enforceable, so the system can be split later
- one order can be followed end to end without distributed tracing
- low running cost and low operational load on the lab

## Considered Options

- One deployable, contexts as modules with enforced borders (modular monolith)
- One service per bounded context
- Two or three services, grouped by what changes together (e.g. shop floor vs. warehouse)

### Option A — Modular monolith

- Good: one build, one deploy, one process; cross-context calls are function calls
- Good: borders are enforced by tooling (see 0003), so a later split is a refactor, not a rewrite
- Bad: all modules scale together; a hot context pays for the idle ones
- Bad: one team's broken `main` blocks every team's deploy

### Option B — One service per context

- Good: independent scaling, deploys and failure isolation per context
- Bad: six deployables, a broker, retries and idempotency before the first order goes through
- Bad: more operational surface than two teams and one lab can carry

### Option C — Two or three services by rate of change

- Good: splits along the likely team border, with fewer hops than Option B
- Bad: still needs a transport, delivery guarantees and versioned contracts between services
- Bad: guesses the right split before any load or change data exists

## Decision Outcome

Chosen: **Option A**, because it is the only option the teams can operate now while keeping the
borders real. The modelling decision (bounded contexts) and the economic decision (deployment
units) are allowed to differ; here they do.

## Consequences

- Good: the whole system runs with `docker compose up` and one `npm run start:dev`
- Good: the timeline of an order is one table in one database
- Bad: scaling is all-or-nothing; the busiest context sets the size of the box
- Bad: a red `main` is everyone's problem
- Neutral: integration is in-process (see 0005); its failure semantics are not decided yet
- Revisit if any of these is observed:
  - one module's load forces the whole deployable to scale while the other modules sit idle
  - a team cannot release because another team's change broke `main`, often enough that it slows delivery
  - a context has to be isolated from the rest (personal data, regulation, a separate security boundary)

## Links

- Related: [0003](0003-module-borders-follow-bounded-contexts.md), [0005](0005-integration-through-contracts.md)
- PV293 Seminar 05, "Your board as deployable units"
