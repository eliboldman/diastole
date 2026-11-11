#!/bin/zsh
# After a push to main: make sure Vercel actually deployed it, and that the live site answers.
#
#   scripts/verify-deploy.sh            checks the current HEAD
#   scripts/verify-deploy.sh <sha>      checks a specific commit
#
# Vercel reports each build on the GitHub commit ("Vercel – physiology-os"). If no build shows up
# (GitHub → Vercel occasionally drops a push), it re-triggers with an empty commit once. Then it
# waits for the build to finish and smoke-tests diastole.app. Exit code 0 only when it's live.
set -uo pipefail

PROJECT_CONTEXT="Vercel – physiology-os"
SITE="https://diastole.app"
cd "${0:A:h}/.."
SHA="$(git rev-parse "${1:-HEAD}")"

status_of() { # prints "<state>\t<target url>" for the live project's Vercel status, or nothing
  gh api "repos/:owner/:repo/commits/$1/status" --jq ".statuses[] | select(.context == \"$PROJECT_CONTEXT\") | \"\(.state)\t\(.target_url)\"" 2>/dev/null | head -1
}

wait_for() { # $1 sha, $2 seconds to wait for a status to appear; prints final state
  local sha=$1 appear=$2 waited=0 s=""
  while (( waited < appear )); do
    s="$(status_of "$sha")"
    [[ -n "$s" ]] && break
    sleep 10; (( waited += 10 ))
  done
  [[ -z "$s" ]] && { echo "none"; return; }
  waited=0
  while [[ "${s%%$'\t'*}" == "pending" ]] && (( waited < 600 )); do
    sleep 15; (( waited += 15 ))
    s="$(status_of "$sha")"
  done
  echo "$s"
}

echo "Checking deploy of ${SHA:0:7}…"
result="$(wait_for "$SHA" 120)"
if [[ "$result" == "none" ]]; then
  echo "No Vercel build appeared for ${SHA:0:7} after 2 minutes. Re-triggering with an empty commit."
  [[ "$(git rev-parse HEAD)" == "$SHA" && "$(git rev-parse --abbrev-ref HEAD)" == "main" ]] || { echo "Not on main at that commit; redeploy by hand."; exit 1; }
  git commit -q --allow-empty -m "Redeploy ${SHA:0:7} (Vercel missed the push)" && git push -q origin main || { echo "Push failed."; exit 1; }
  SHA="$(git rev-parse HEAD)"
  result="$(wait_for "$SHA" 180)"
  [[ "$result" == "none" ]] && { echo "Vercel still didn't pick it up. Check the Vercel ↔ GitHub connection."; exit 1; }
fi

state="${result%%$'\t'*}"
url="${result#*$'\t'}"
if [[ "$state" != "success" ]]; then
  echo "Deploy ${state}: $url"
  exit 1
fi
echo "Deployed: $url"

# Smoke test: public pages render, signed-out app pages redirect to login (not a 500).
fail=0
for page in / /login /privacy; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE$page")"
  [[ "$code" == "200" ]] || { echo "  $page → $code"; fail=1; }
done
for page in /me /dashboard /workouts; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$SITE$page")"
  [[ "$code" == 30[0-9] ]] || { echo "  $page → $code (expected a redirect to login)"; fail=1; }
done
(( fail )) && { echo "Live site check FAILED."; exit 1; }
echo "Live site OK."
