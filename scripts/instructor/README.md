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
   (`DROP SCHEMA IF EXISTS checkout, inventory, fulfilment, platform CASCADE`),
5. runs `kubectl rollout restart deployment/eshop` and waits for it (120 s), so migrations re-run
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
