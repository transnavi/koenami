#!/usr/bin/env bash
# Re-records the browser goldens and API fixtures against the real analyzer.
# Needs the Python environment (.venv or KOENAMI_PYTHON) and the models under .models.
#   bun run test:e2e:record [playwright args]
set -euo pipefail
cd "$(dirname "$0")/../.."
python=${KOENAMI_PYTHON:-.venv/bin/python}
if ! git diff --quiet -- curation/reviews.jsonl; then echo "curation/reviews.jsonl has uncommitted changes; commit or stash them first" >&2; exit 1; fi
seed='{"speaker":"23bbcff6f628","clip":"common_voice_ja_19580185","display":"M 1","language":"ja","flags":[],"scope":"clip","ratings":{"femininity":1.0,"masculinity":5.0},"note":"","reviewed":"2026-01-01T00:00:00+00:00"}'
cleanup() {
	git checkout -q -- curation/reviews.jsonl
	[[ -n ${analyzer:-} ]] && kill "$analyzer" 2>/dev/null || true
}
trap cleanup EXIT
# One partial review, so the update mode of the review page has a speaker to show.
printf '%s\n' "$seed" >> curation/reviews.jsonl
KOENAMI_PUBLIC=0 KOENAMI_DATA="$PWD/tests/fixtures/data" "$python" server.py --port 35512 & analyzer=$!
for _ in $(seq 100); do curl -sf http://127.0.0.1:35512/api/catalog >/dev/null && break; sleep 0.2; done
curl -sf http://127.0.0.1:35512/api/catalog >/dev/null || { echo "analyzer did not start" >&2; exit 1; }
# A full run starts from nothing, so fixtures of removed scenarios do not linger.
if [[ $# -eq 0 ]]; then rm -rf tests/golden/e2e tests/golden/canvas tests/fixtures/api coverage/e2e; fi
node -e '
const fs = require("fs");
const meta = JSON.parse(fs.readFileSync("tests/golden/META.json", "utf8"));
meta.playwright = require("@playwright/test/package.json").version;
meta.chromium = require("playwright-core").chromium.executablePath().split("/").find((p) => p.startsWith("chromium")) || "";
meta.recorded = new Date().toISOString().slice(0, 10);
fs.writeFileSync("tests/golden/META.json", JSON.stringify(meta, null, "\t") + "\n");
'
MOCK_API_RECORD=http://127.0.0.1:35512 RECORD=1 bun x playwright test --config playwright.config.ts --update-snapshots=all "$@"
