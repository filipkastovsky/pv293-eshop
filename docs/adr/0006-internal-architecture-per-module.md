# 0006. Internal architecture is each module's own choice

- Status: accepted
- Date: 2026-11-22
- Deciders: PV293 instructor

## Context and Problem Statement

0003-0005 fix everything a module shows to the outside: where its border is, which data it owns,
and what it publishes and answers. What happens inside a module is still open. The modules are
not alike: Catalog is little more than records with a few rules, Payment wraps an external
gateway, Checkout carries most of the business rules of the shop. We have to decide whether every
module is built the same way inside, or whether each module chooses.

## Decision Drivers

- the effort spent on a module's design matches how much that module matters to the business
- a team can change how its module works inside without asking anyone, as long as its contracts hold
- a newcomer to a module can find out quickly how it is built
- the borders (0003-0005) stay the only thing every module must agree on

## Considered Options

- Each module chooses its own internal architecture and documents it
- One prescribed internal architecture for every module

### Option A — Each module chooses

- Good: a simple module stays simple; a complex one gets the structure it needs
- Good: the borders carry the architecture; inside a border, nothing another team does can break you
- Bad: someone moving between modules has to learn a different style each time
- Bad: no shared internal helpers; a good idea in one module is copied, not reused

### Option B — One prescribed style everywhere

- Good: every module looks the same; code review expectations are the same everywhere
- Bad: the style is either too heavy for the simple modules or too light for the complex ones
- Bad: changing the style later means changing every module at once

## Decision Outcome

Chosen: **Option A**, because once the borders are fixed, the inside of a module is a small
project of its own, and the team that owns it is best placed to decide how to build it.

Rules:

- every module keeps the borders (0003), owns its data (0004) and integrates only through contracts (0005); nothing else is shared
- every module's README has an **Internal architecture** section: the style it uses, in two or three sentences, and why
- the choice follows the kind of subdomain: generic and supporting modules use the simplest thing that works; the core gets the most careful design
- the existing modules differ on purpose: Catalog is plain create-read-update over its own data, Payment isolates the external gateway behind an adapter, Notifications is a thin reaction to events
- the owning team chooses for its module; changing the choice later needs no one else's approval

## Consequences

- Good: a team can rewrite its module's inside without coordinating, and the rest of the system cannot tell
- Good: the modules show side by side that one system can hold several internal architectures
- Bad: there is no single answer to "how is code structured here"; the answer is per module
- Bad: a problem solved well in one module may be solved badly in another
- Neutral: cross-cutting concerns that every module needs (database connection, message bus) are provided by the platform, not by any module
- Revisit if any of these is observed:
  - people move between modules often enough that the different styles slow them down
  - the same kind of defect appears in several modules because each solved the same problem differently
  - a module's internal design repeatedly leaks through its contracts

## Links

- Related: [0003](0003-module-borders-follow-bounded-contexts.md), [0004](0004-each-module-owns-its-data.md), [0005](0005-integration-through-contracts.md)
- PV293 Seminar 03, "Not all parts are equally important" (core, supporting, generic)
