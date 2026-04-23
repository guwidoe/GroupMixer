#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

export RUSTFLAGS="${RUSTFLAGS:-} -Awarnings"

cargo test -q -p gm-core solver5 -- --nocapture >/dev/null
