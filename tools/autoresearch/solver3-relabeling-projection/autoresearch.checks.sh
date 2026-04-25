#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

cargo check -q -p gm-core
cargo check -q -p gm-benchmarking
cargo test -q -p gm-core constraint_aware_projection::relabeling --lib
cargo test -q -p gm-benchmarking
