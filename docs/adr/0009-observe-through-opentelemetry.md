# 0009. Observe the system through a vendor-neutral telemetry standard

- Status: accepted
- Date: 2026-11-23
- Deciders: PV293 instructor

## Context and Problem Statement

One request now crosses several modules through in-process events (0005), and Payment's events
leave through an outbox, later and from another place in the process. When an order stalls, the
only evidence is the order's timeline and plain log lines, and nothing ties a log line to the
request that wrote it. We have to decide how we see what the running system does, without asking
every team to build that into its module.

## Decision Drivers

- one order can be followed across modules, including across the outbox, as a single picture
- a log line leads to the request it belongs to, and the request leads back to its log lines
- modules contain no code for this; a team's reaction to an event shows up without the team doing anything
- the system does not depend on one vendor's agent or format; the destination can change without touching the application
- no personal data in what we emit

## Considered Options

- A vendor's agent inside the application, sending to that vendor
- A vendor-neutral standard for traces and logs, produced by the platform, sent to a collector
- Logs only, plus metrics scraped from the application

### Option A — Vendor agent

- Good: least to set up; the vendor's agent finds the framework and the database on its own
- Good: its dashboards work out of the box
- Bad: the application's telemetry is in the vendor's format; changing vendor means changing the application
- Bad: what is collected, and what it costs, is decided by the agent's defaults rather than by us

### Option B — Vendor-neutral standard, produced by the platform

- Good: the application speaks a standard format and knows only an endpoint; the backend is a deployment setting
- Good: the platform wraps the event bus and every handler once, so modules need no code and students' code is traced as written
- Good: traces and logs carry the same identifiers, which gives the log-to-request link
- Bad: the platform owns the wrapping code and must keep it working when the bus or the framework changes
- Bad: nothing is visible until something receives the data

### Option C — Logs and scraped metrics only

- Good: no new moving parts; logs already exist
- Good: cheap to run and easy to read for one request
- Bad: following one order across modules means searching several log lines by hand and trusting that each carries the order id
- Bad: the gap between an outbox write and its delivery cannot be shown as one story

## Decision Outcome

Chosen: **Option B**, because it is the only option that gives a cross-module picture of an order
and the log-to-request link without code in the modules, and it keeps the choice of backend out
of the application. Option C was close for a system this small; we chose B because the outbox
gap is exactly where C is blind.

Rules:

- the platform produces the telemetry; modules contain no instrumentation code and log through the framework's logger with structured fields
- publishing an event, running each of its subscribers and running each command or query handler are separate steps in the trace, named after the event or the handler
- the outbox stores the trace context with each row, and its relay starts a new trace linked to the one that wrote the row
- logs are one structured line each, carry the trace identifiers when a request is active, and are sent as telemetry too
- the application exports only when a destination is configured; with none, nothing leaves the process
- personal data (a customer's email) is never put on a trace or in a log; known fields are redacted as a safety net

## Consequences

- Good: "what happened to this order?" has one picture instead of a search
- Good: a failing handler is named on its step, not only on the order's timeline
- Bad: telemetry volume and its cost grow with traffic; sampling is not decided
- Bad: redaction knows field names, not meaning; a new field holding personal data is not caught until someone adds it
- Neutral: telemetry is a diagnosis aid; it is not an audit trail and does not change delivery guarantees
- Revisit if any of these is observed:
  - the telemetry bill or the volume forces us to drop data we later needed
  - personal data appears in an emitted log or trace
  - a module needs a step in the trace that the platform cannot see from outside
  - the platform's wrapping breaks on a framework upgrade more than once

## Links

- Related: [0002](0002-modular-monolith-one-deployable.md), [0005](0005-integration-through-contracts.md)
- PV293 Seminar 06
