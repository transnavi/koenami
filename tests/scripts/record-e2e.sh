#!/usr/bin/env bash
# Re-records the browser goldens and API fixtures against the real analyzer.
# Needs the Python environment (.venv or KOENAMI_PYTHON) and the models under .models.
#   bun run test:e2e:record [playwright args]
set -euo pipefail
cd "$(dirname "$0")/../.."
python=${KOENAMI_PYTHON:-.venv/bin/python}
seed='{"speaker":"23bbcff6f628","clip":"common_voice_ja_19580185","display":"M 1","language":"ja","flags":[],"scope":"clip","ratings":{"femininity":1.0,"masculinity":5.0},"note":"","reviewed":"2026-01-01T00:00:00+00:00"}'
cleanup() {
	git checkout -q -- curation/reviews.jsonl
	[[ -n ${analyzer:-} ]] && kill "$analyzer" 2>/dev/null || true
	[[ -n ${mock:-} ]] && kill "$mock" 2>/dev/null || true
}
trap cleanup EXIT
# One partial review, so the update mode of the review page has a speaker to show.
printf '%s\n' "$seed" >> curation/reviews.jsonl
KOENAMI_PUBLIC=0 KOENAMI_DATA="$PWD/tests/fixtures/data" "$python" server.py --port 35512 & analyzer=$!
for _ in $(seq 100); do curl -sf http://127.0.0.1:35512/api/catalog >/dev/null && break; sleep 0.2; done
rm -rf tests/golden/e2e tests/golden/canvas coverage/e2e
MOCK_API_PORT=8776 MOCK_API_RECORD=http://127.0.0.1:35512 node tests/mock-api/server.mjs & mock=$!
sleep 1
RECORD=1 bun x playwright test --config playwright.config.ts --update-snapshots=all "$@"
