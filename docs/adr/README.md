# Architecture Decision Records

Why the system is built the way it is. One decision per file, numbered in order, never renumbered.
The current state of the system is in [architecture.md](../architecture.md); these files keep the
reasoning behind it.

| Number | Title | Status |
| --- | --- | --- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | accepted |
| [0002](0002-modular-monolith-one-deployable.md) | Modular monolith, one deployable | accepted |
| [0003](0003-module-borders-follow-bounded-contexts.md) | Module borders follow the bounded contexts, enforced by lint | accepted |
| [0004](0004-each-module-owns-its-data.md) | Each module owns its data | accepted |
| [0005](0005-integration-through-contracts.md) | Modules integrate only through contracts: events and public queries | accepted |
| [0006](0006-internal-architecture-per-module.md) | Internal architecture is each module's own choice | accepted |
| [0007](0007-deploy-every-green-main.md) | Deploy every green `main` automatically | accepted |
| [0009](0009-observe-through-opentelemetry.md) | Observe the system through a vendor-neutral telemetry standard | accepted |

Open:

- 0008 — What happens to an event when its handler fails? — open, not yet written

## How we write ADRs

- Copy [template.md](template.md) to `NNNN-short-kebab-slug.md`, with the next free number. The
  title names the decision, not the topic.
- Write in role: as the people making the decision, at the time they make it, about this system.
- Give two or three options you would plausibly have shipped. A straw man fools nobody.
- Every option and the consequences get honest `Bad:` lines. An ADR without one has not been
  thought about.
- End the consequences with concrete `Revisit if` triggers: things someone could observe, not
  "if requirements change".
- An accepted ADR is immutable except its status and links. To change a decision, write a new ADR
  that supersedes it and set the old one's status to `superseded by [NNNN](NNNN-....md)`.
- ADRs name decisions, not tools. The tools that implement a decision are listed in the
  repository [README](../../README.md).
- A business rule (prices, stock levels, when an order is cancelled) is not an architecture
  decision; it belongs in the code, its tests and the module README.
- `npm run docs:check` checks file names, numbering, the required sections, a `- Bad:` line and
  that this index matches the files.
