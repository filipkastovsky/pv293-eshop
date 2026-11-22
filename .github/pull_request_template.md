## What and why

<!-- One or two sentences. Link the issue or milestone. -->

## Checklist

- [ ] The README of every module I changed is up to date (events emitted and consumed, policies, public queries, HTTP, internal architecture).
- [ ] If I changed `src/contracts/`, I listed every consuming module here and checked each of them.
- [ ] I touched no other module's code, schema or migrations.
- [ ] Does this change make an architectural decision? If yes, there is an ADR in `docs/adr/` (accepted ADRs are superseded, not edited).
- [ ] `docs/architecture.md` is still true after this change.
- [ ] `npm run lint`, `npm run docs:check` and `npm test` are green locally.

<!-- Consuming modules (if contracts changed): -->
