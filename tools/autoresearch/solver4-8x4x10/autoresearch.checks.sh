#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

cargo test -q -p gm-core solver4::tests -- --nocapture >/dev/null
cargo test -q -p gm-benchmarking --lib >/dev/null
cargo test -q -p gm-contracts --lib >/dev/null
