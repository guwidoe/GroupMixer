#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

cargo test -q -p gm-core solver3 -- --nocapture >/dev/null
cargo test -q -p gm-core --test search_driver_regression solver3_ -- --nocapture >/dev/null
cargo test -q -p gm-benchmarking 'hotpath_suite_runs_solver3_' -- --nocapture >/dev/null
