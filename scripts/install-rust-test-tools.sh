#!/usr/bin/env bash
set -euo pipefail

TOOLS=(
  cargo-nextest
  cargo-llvm-cov
  cargo-tarpaulin
  cargo-mutants
)

for tool in "${TOOLS[@]}"; do
  echo ">>> Installing ${tool}"
  cargo install --locked "${tool}"
done

echo "Installed Rust testing tools: ${TOOLS[*]}"
