# Instructor scripts

Not part of the student exercise.

## reset-seminar.sh

```bash
scripts/instructor/reset-seminar.sh <kube-context>
```

After a seminar group, resets everything to the starting state:

1. asks for confirmation (type `reset`),
2. force-pushes the tag `starter` to `main`,
3. waits (up to 15 min) until CI has deployed the image tagged with the 7-char sha of `starter`
   (skipped if `deployment/eshop` already runs it, since the push is then a no-op),
4. drops the module schemas in database `pv293_eshop` on the current CloudNativePG primary
   (`DROP SCHEMA IF EXISTS catalog, checkout, inventory, fulfilment, payment, notifications, platform CASCADE`;
   all of them, so live-walkthrough edits, payments and notifications do not leak into the next run),
5. runs `kubectl rollout restart deployment/eshop` and waits for it (120 s), so migrations and seeds re-run
   on a fresh pod right after the drop.

The primary is read from cluster `main` in namespace `cnpg-system`
(`.status.currentPrimary`); `psql` runs inside that pod as user `postgres` over the local
socket. Every `kubectl` call uses the given context. If CI never goes green, the script times out
before dropping anything.

Prerequisites: `git` with push rights to `main` (branch protection must allow the force push
for you, or be lifted temporarily), `kubectl` with a context for the lab cluster, the local tag
`starter` (`git fetch --tags`).

## Collaborators

Put one GitHub login per line into `scripts/instructor/collaborators.txt` (gitignored), then:

```bash
while read -r login; do
  gh api -X PUT "repos/filipkastovsky/pv293-eshop/collaborators/$login" -f permission=push
done < scripts/instructor/collaborators.txt
```

Before the seminar check that every invitation was accepted
(`gh api repos/filipkastovsky/pv293-eshop/invitations` should be empty).

## Before adding LAB_KUBECONFIG

- Environment `lab` is restricted to branch `main` (deployment branch policy).
- Code-owner review is required (`.github/CODEOWNERS` covers `/.github/` and `/scripts/instructor/`).
- The kubeconfig token is scoped to namespace `pv293-eshop` only.

## Pre-seminar checklist

- The lab runs with `DEV_ENDPOINTS=true`.
- The cluster can pull the image.
- The secret `LAB_KUBECONFIG` is set and the deploy job actually rolls out (it is not skipping; look for the `::warning::`).
- Every collaborator invitation has been accepted.
- No chaos is left armed (a restart clears it).
- Grafana Explore is open with the Tempo and Loki tabs and the saved TraceQL
  `{ resource.service.name = "pv293-eshop" }` (empty until the live platform merge).
- The telemetry PR is open and green, not merged (see "Live platform merge").
- After the seminar, check the Grafana Cloud budget (span metrics and service graph add series
  for one more service).

## Live platform merge

The telemetry PR (`feat/otel`) is merged **during** the seminar, on the projector, after the first
team crosses a border (slide "A Platform Change, Live"). Until then the lab sends nothing to
Grafana: no traces, and the pod's console logs are not collected.

Before the seminar:

- The PR is open, reviewed and green. Do not merge it.
- It was dry-run on the lab: the branch image deployed by hand, traces and logs checked, then the
  `main` image rolled back.
- The `solution` branch is rebased onto `feat/otel`: it only has to work after the merge.

In the room:

1. Check the PR against the current `main`. A team that added `docs/adr/0008-*` to the ADR index
   causes a one-line conflict in `docs/adr/README.md`: resolve it in the GitHub editor, keep both rows.
2. Wait for the PR checks to go green, then merge.
3. The deploy rolls out in a few minutes and restarts the box (chaos is cleared, payment migrates).
   Talk through "What Just Happened To You" meanwhile.
4. Students catch up: `nvm install 26 && nvm use`, `git pull --rebase origin main && npm ci`.
   Open PRs re-run their checks on Node 26.
5. In Grafana, wait for the first `pv293-eshop` trace, then arm chaos again for "Same Failure, Now Visible".

If the deploy fails: revert the merge commit on `main` (the deploy rolls back with it) and continue
without telemetry; the slides from "You Saw This In Seminar 02" on can be skipped.

## Telemetry (Grafana Cloud)

The live app sends traces and logs to the instructor's Grafana Cloud. The demo data sources link a
trace to its logs and back; they are created once through the Grafana HTTP API, with fixed uids:

| Signal         | Data source name | uid            | Notes                                                                          |
| -------------- | ---------------- | -------------- | ------------------------------------------------------------------------------ |
| Traces (Tempo) | `pv293-traces`   | `pv293-traces` | trace to logs: `{service_name="pv293-eshop"} \| trace_id="${__trace.traceId}"` |
| Logs (Loki)    | `pv293-logs`     | `pv293-logs`   | `trace_id` links to `pv293-traces`                                             |

- Grafana Cloud stack URL: `<TODO: fill in when the data sources are created>`
- Created on: `<TODO>`
