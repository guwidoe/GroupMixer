#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

export RUSTFLAGS="${RUSTFLAGS:-} -Awarnings"

cargo test -q -p gm-core solver5::tests -- --nocapture >/dev/null
cargo run -q -p gm-core --example solver5_construction_coverage -- --json-out "$ROOT/autoresearch.last_run_metrics.json"
