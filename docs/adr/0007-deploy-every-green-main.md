# 0007. Deploy every green `main` automatically

- Status: accepted
- Date: 2026-11-22
- Deciders: PV293 instructor

## Context and Problem Statement

There is one deployable (0002) and one environment it runs in, shared by both teams. Changes
arrive from two teams through pull requests to `main`. We have to decide how a merged change gets
from `main` to the running system, and what has to be true before it does.

## Decision Drivers

- a merged change is visible on the running system within minutes, without waiting for a person
- nothing reaches the running system unless the whole system, not just the changed module, still works
- nobody outside the instructor holds access to the environment
- the deploy is the same every time, so a failed deploy points at the change, not at the procedure

## Considered Options

- Every commit on `main` that passes all checks is deployed automatically
- An operator deploys on request, from a chosen commit

### Option A — Automatic deploy of every green `main`

- Good: merging is releasing; feedback from the running system comes minutes after the merge
- Good: small, frequent deploys; when one breaks, the cause is one recent change
- Good: the pipeline holds the only credentials, scoped to updating this one application
- Bad: a red `main` blocks every team's deploy until someone fixes it
- Bad: no staging environment; a bug the checks miss reaches users immediately

### Option B — Operator deploys on request

- Good: a person decides when a release happens, and can batch or hold changes
- Bad: the operator becomes the bottleneck and the single point of failure for every release
- Bad: larger, rarer releases; when one breaks, there are many candidate causes

## Decision Outcome

Chosen: **Option A**, because with two teams merging all day, any human step in the release path
becomes the bottleneck, and small releases are the cheapest to debug.

Rules:

- pull requests run the full checks (build, boundaries, documentation, tests) and cannot merge red
- after a merge, `main` runs the checks again, including an end-to-end test of the order happy path,
  because two pull requests that pass alone can fail together; only a green `main` is deployed
- the deploying identity can update this application's version and nothing else in the environment
- a broken release is fixed forward or rolled back by reverting the commit on `main`

## Consequences

- Good: "is it deployed?" has one answer: if `main` is green, yes
- Good: the environment's access is limited to one narrowly scoped identity
- Bad: a red `main` is every team's problem, and fixing it comes before any other work
- Bad: the only environment is the one users see
- Neutral: database changes ship with the code, so every migration must work against the data already there
- Revisit if any of these is observed:
  - a release breaks the running system in a way the checks could not have caught
  - a team is regularly blocked from releasing by another team's red `main`
  - a change needs to be tried against realistic data before users see it

## Links

- Related: [0002](0002-modular-monolith-one-deployable.md)
- PV293 Seminar 05, "Where does this actually run?"
