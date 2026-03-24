#!/usr/bin/env bash
set -euo pipefail

if ! command -v cargo-mutants >/dev/null 2>&1; then
  echo "cargo-mutants is required. Run ./scripts/install-rust-test-tools.sh first." >&2
  exit 1
fi

cargo mutants -p solver-core "$@"
