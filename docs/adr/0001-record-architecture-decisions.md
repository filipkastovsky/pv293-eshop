# 0001. Record architecture decisions

- Status: accepted
- Date: 2026-11-22
- Deciders: PV293 instructor

## Context and Problem Statement

This system will outlive the team that started it: it keeps changing, and people join and leave
while it does. Without a record, the next person sees *what* the
code does but not *why* it was built this way, and either preserves an accident or breaks a
decision nobody remembers making.

## Decision Drivers

- a newcomer can find why a structural choice was made without asking anyone
- the record costs minutes per decision, not hours
- the record lives next to the code and changes through the same pull requests

## Considered Options

- ADRs as Markdown in `docs/adr/`, MADR-based house template (PV293 Seminar 01)
- A wiki outside the repository (Notion, Confluence)
- A developer portal (Backstage with the ADR plugin and TechDocs)
- Decisions in pull request descriptions and the issue tracker only

### Option A — ADRs in the repository

- Good: one decision per file, easy to link from code, reviews and slides
- Good: changes through the same pull requests as the code, so a decision and its implementation are reviewed together
- Good: the reasoning is frozen at the time of the decision; history is visible through supersession
- Bad: someone must notice that a change is a decision and write it down
- Bad: people who don't read the repository (business, support) don't see it

### Option B — A wiki (Notion, Confluence)

- Good: comfortable editing, comments, readable by non-developers
- Bad: lives apart from the code; nothing forces an update when the code changes, so it drifts
- Bad: pages are rewritten in place, so the reasoning behind earlier states is lost unless someone is disciplined about it
- Bad: access, export and history depend on a vendor and on workspace permissions students may not have

### Option C — A developer portal (Backstage)

- Good: one place to find every system, its owner, its APIs and its decisions across many repositories
- Good: Backstage's ADR plugin and TechDocs **read Markdown from the repository**, so it sits on top of Option A rather than replacing it
- Bad: a portal to run and keep up to date for a single repository and two teams
- Neutral: the value grows with the number of repositories, not with the number of decisions

### Option D — Pull requests and issues only

- Good: zero extra process
- Bad: scattered, hard to search, tied to one hosting platform

## Decision Outcome

Chosen: **Option A**, because it keeps each decision next to the code it governs, reviewed in the
same pull request, with its reasoning intact as the system changes. `docs/architecture.md`
complements it with the current state. Option C was close but is premature: a portal pays off
across many repositories, and it would consume these same files anyway.

## Consequences

- Good: the system changes by superseding ADRs, which keeps its history readable
- Bad: ADRs that nobody writes give a false sense of completeness
- Neutral: accepted ADRs are immutable except their status and links
- Neutral: the files stay portal-ready (MADR, one decision per file) if Backstage is added later
- Revisit if: the system is split into several repositories (a portal starts paying off), or the
  ADR set is no longer read before changes are made

## Links

- Template: [template.md](template.md)
- PV293 Seminar 01, Architecture Decision Records
