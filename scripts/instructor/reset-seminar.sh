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
echo "  2. wait until CI has deployed the starter image (up to 15 min)"
echo "  3. DROP SCHEMA checkout, inventory, fulfilment, platform CASCADE in pv293_eshop (context: $ctx)"
echo "  4. restart deployment/eshop so migrations re-run on a fresh pod"
read -r -p "Type 'reset' to continue: " answer
[ "$answer" = "reset" ] || { echo "Aborted."; exit 1; }

k() { kubectl --context "$ctx" "$@"; }

sha7=$(git rev-parse --short=7 refs/tags/starter)
current_image() {
  k -n pv293-eshop get deployment/eshop \
    -o jsonpath='{.spec.template.spec.containers[?(@.name=="eshop")].image}'
}

primary=$(k -n cnpg-system get cluster main -o jsonpath='{.status.currentPrimary}')
[ -n "$primary" ] || { echo "Could not determine the CNPG primary." >&2; exit 1; }
echo "CNPG primary: $primary; expected image tag: $sha7"

git push --force origin refs/tags/starter:refs/heads/main

if [[ "$(current_image)" == *":$sha7" ]]; then
  echo "Deployment already runs :$sha7, no CI run to wait for."
else
  echo "Waiting for CI to deploy :$sha7 (up to 15 min)..."
  deadline=$((SECONDS + 900))
  until [[ "$(current_image)" == *":$sha7" ]]; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "Timed out; deployment still runs $(current_image). Check CI. Schemas NOT dropped." >&2
      exit 1
    fi
    echo "  still on $(current_image) ..."
    sleep 15
  done
fi
k -n pv293-eshop rollout status deployment/eshop --timeout=120s

# Drop and restart back to back so no pod serves against dropped schemas for long.
k -n cnpg-system exec "$primary" -- psql -U postgres -d pv293_eshop -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA IF EXISTS checkout, inventory, fulfilment, platform CASCADE'
k -n pv293-eshop rollout restart deployment/eshop
k -n pv293-eshop rollout status deployment/eshop --timeout=120s
echo "Done."
