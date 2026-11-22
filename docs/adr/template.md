# NNNN. Short title, naming the decision

- Status: proposed | accepted | rejected | deprecated | superseded by [NNNN](NNNN-other.md)
- Date: YYYY-MM-DD
- Deciders: who actually made the call

## Context and Problem Statement

Two or three sentences describing the situation that forces a decision.
Write the *problem*, not a shortlist of solutions. Someone who joins in a
year should understand the pressure you were under without asking anyone.

## Decision Drivers

What you will judge the options against. Write these **before** you look at
the options — otherwise you will reverse-engineer them from the thing you
already wanted.

- driver 1, e.g. must be generatable outside the database
- driver 2, e.g. negligible overhead on the request path
- driver 3, e.g. integrates with the framework's DI rather than bypassing it

## Considered Options

- Option A
- Option B
- Option C

Three or more, and they have to be options you would plausibly have shipped.
Listing a straw man to knock it down fools nobody, including future you.

### Option A — name

- Good: ...
- Good: ...
- Bad: ...

### Option B — name

- Good: ...
- Bad: ...

### Option C — name

- Good: ...
- Bad: ...

## Decision Outcome

Chosen: **Option X**, because <how it scores against the drivers above>.

If the decision was close, say so and say what would flip it. "We picked X
over Y on team familiarity alone" is a legitimate and useful outcome.

## Consequences

- Good: what gets easier
- Bad: what gets harder, what you are now coupled to, what you gave up
- Neutral: what changes without being better or worse
- Revisit if: the condition that would make this decision wrong

An ADR with no `Bad:` line has not been thought about.

## Links

- Related: [NNNN](NNNN-related.md)
- The benchmark, RFC, issue or docs page you actually read. If a driver rests
  on a performance claim, link the number — and say whose benchmark it is.
  Vendor benchmarks are still evidence, as long as you label them.
