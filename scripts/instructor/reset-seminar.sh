#!/usr/bin/env bash
# Reset the seminar: main <- tag `starter`, drop module schemas, wait for redeploy.
# Usage: scripts/instructor/reset-seminar.sh <kube-context>
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <kube-context>" >&2
  exit 1
fi
ctx=$1
repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

git rev-parse -q --verify refs/tags/starter >/dev/null || {
  echo "Local tag 'starter' not found (git fetch --tags)." >&2
  exit 1
}

echo "This will:"
echo "  1. force-push tag 'starter' to origin/main (discarding all student work on main)"
echo "  2. DROP SCHEMA checkout, inventory, fulfilment, platform CASCADE in pv293_eshop (context: $ctx)"
echo "  3. wait for the redeploy of deployment/eshop"
read -r -p "Type 'reset' to continue: " answer
[ "$answer" = "reset" ] || { echo "Aborted."; exit 1; }

k() { kubectl --context "$ctx" "$@"; }

primary=$(k -n cnpg-system get cluster main -o jsonpath='{.status.currentPrimary}')
[ -n "$primary" ] || { echo "Could not determine the CNPG primary." >&2; exit 1; }
echo "CNPG primary: $primary"

git push --force origin refs/tags/starter:refs/heads/main

k -n cnpg-system exec "$primary" -- psql -U postgres -d pv293_eshop -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA IF EXISTS checkout, inventory, fulfilment, platform CASCADE'

echo "Waiting for the new image to roll out (CI must be green on main)..."
sleep 20
k -n pv293-eshop rollout status deployment/eshop --timeout=600s
echo "Done."
