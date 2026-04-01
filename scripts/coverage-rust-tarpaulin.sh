#!/usr/bin/env bash
set -euo pipefail

if ! command -v cargo-tarpaulin >/dev/null 2>&1; then
  echo "cargo-tarpaulin is required. Run ./scripts/install-rust-test-tools.sh first." >&2
  exit 1
fi

mkdir -p target/coverage/tarpaulin

cargo tarpaulin \
  -p gm-core \
  --engine llvm \
  --tests \
  --all-features \
  --out Html \
  --output-dir target/coverage/tarpaulin

echo "Tarpaulin report written to target/coverage/tarpaulin/"
