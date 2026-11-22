# Instructor scripts

Not part of the student exercise.

## reset-seminar.sh

```bash
scripts/instructor/reset-seminar.sh <kube-context>
```

After a seminar group, resets everything to the starting state:

1. asks for confirmation (type `reset`),
2. force-pushes the tag `starter` to `main` (CI builds and deploys the starter image),
3. drops the module schemas in database `pv293_eshop` on the current CloudNativePG primary
   (`DROP SCHEMA IF EXISTS checkout, inventory, fulfilment, platform CASCADE` through
   `kubectl -n cnpg-system exec`), so the new pod re-runs the migrations,
4. waits for `deployment/eshop` in namespace `pv293-eshop` to roll out.

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
