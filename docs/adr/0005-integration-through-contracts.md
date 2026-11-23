# 0005. Modules integrate only through contracts: events and public queries

- Status: accepted
- Date: 2026-11-22
- Deciders: PV293 instructor

## Context and Problem Statement

Modules cannot import each other (0003) or read each other's data (0004), yet an order has to
travel from Checkout through Inventory, Payment and Fulfilment to Notifications. We have to decide
what may cross a module border, in which direction, and who owns the shape of what crosses.

## Decision Drivers

- a module that publishes something does not need to know who reacts to it
- a reaction to another module's event lives in the reacting module (the course's event storming rule)
- what crosses a border is small, explicit and versioned in one place
- the same shapes would survive a change of transport

## Considered Options

- Domain events and public read-only queries, defined in a shared contracts package, over an in-process bus
- Each module exports a service facade; other modules call its methods directly
- Domain events only; every module keeps local copies of the data it needs

### Option A — Events and public queries through contracts

- Good: events decouple publisher from subscribers; adding a reaction never touches the publisher
- Good: queries cover the common "I just need to look this up" case without copying data
- Good: everything that crosses a border is listed in one place and reviewed as such
- Bad: two mechanisms to learn instead of one
- Bad: a query is still a synchronous dependency; if the answering module is broken, the caller is too

### Option B — Service facades

- Good: plain method calls, easy to follow in an editor
- Bad: the caller decides what the callee does next; modules start orchestrating each other
- Bad: the facade grows with every caller's needs, and its types leak the callee's model

### Option C — Events only

- Good: no synchronous dependency between modules at all
- Bad: every module rebuilds copies of other modules' data, plus the code to keep them current
- Bad: too much machinery for two teams and one afternoon

## Decision Outcome

Chosen: **Option A**. Rules:

- **Events** are facts in the past tense, published by the module that owns them, to any number of
  subscribers. A subscriber reacts with a policy that issues **its own module's** command.
- **Public queries** are read-only questions one module answers for others. A query never changes state.
- **No cross-module commands.** A module never tells another module what to do; it publishes what
  happened, and the other module decides.
- Event and query shapes live in a shared contracts package that depends on nothing else in the
  application. A change to a contract is reviewed by every module that consumes it.
- **Events carry the data a subscriber needs to act**, not only identifiers (e.g. `Order Placed`
  carries its lines and total), so a subscriber rarely has to query back.
- Where a module needs another module's data to show or decide something, it asks the owning
  module with a public query. We do not build read models from other modules' events; every read
  is answered by the owner and is therefore strongly consistent.
- Delivery is in-process (0002).

**Not decided here:** what happens when a subscriber fails while handling an event (lost, retried,
rolled back). Left open on purpose; see [0008](0008-recover-event-handling-by-impact.md).

## Consequences

- Good: the happy path reads as a chain of facts, the same chain as on the event storming board
- Good: if modules ever move out of process, the contracts stay; only the transport changes
- Bad: a published event is a public promise; renaming a field is a cross-team change
- Bad: the flow of one order is spread across modules; following it needs a timeline, not a stack trace
- Neutral: HTTP endpoints are each module's own business and not part of the contracts
- Good: reads across modules are strongly consistent; nobody has to reason about stale data
- Bad: a module that answers queries is on the critical path of every module that asks; if it is slow or broken, so are they
- Revisit if any of these is observed:
  - a module fails or slows down because a module it queries is failing or slow
  - one request or policy needs answers from several modules at once
  - modules move out of process, so every query becomes a network call
  - a contract change breaks a consumer

## Links

- Related: [0003](0003-module-borders-follow-bounded-contexts.md), [0004](0004-each-module-owns-its-data.md), [0008](0008-recover-event-handling-by-impact.md)
- PV293 Seminar 03, "Contexts talk to each other"
