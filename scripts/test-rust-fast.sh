#!/usr/bin/env bash
set -euo pipefail

if ! command -v cargo-nextest >/dev/null 2>&1; then
  echo "cargo-nextest is required. Run ./scripts/install-rust-test-tools.sh first." >&2
  exit 1
fi

cargo nextest run --workspace --exclude gm-wasm "$@"
