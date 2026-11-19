#!/bin/bash
# PR anlegen, Checks abwarten, mergen. Aufruf: bash scripts/pr-mergen.sh <branch> <titel> <datei-mit-pr-text>
# Braucht gh mit Schreibrechten auf das Repo. Bricht ab (Exit 1), wenn ein Check fehlschlägt.
set -u
cd "$(dirname "$0")/.."
REPO=JonasEngwicht/hofladen
pr=$(gh api repos/$REPO/pulls -f title="$2" -f head="$1" -f base=main -F body=@"$3" --jq .number) || exit 1
sha=$(git rev-parse "$1")
sleep 20
r=""
for i in $(seq 1 30); do
  r=$(gh api repos/$REPO/commits/$sha/check-runs --jq '[.check_runs[]|.status+":"+(.conclusion//"")]|join(",")')
  [ -n "$r" ] && ! echo "$r" | grep -q "in_progress\|queued" && break
  sleep 20
done
echo "PR $pr Checks: $r"
echo "$r" | grep -q "failure" && { echo "CHECKS FEHLGESCHLAGEN – nicht gemergt"; exit 1; }
gh api -X PUT repos/$REPO/pulls/$pr/merge -f merge_method=merge --jq .merged || exit 1
git checkout -q main && git pull -q --ff-only
