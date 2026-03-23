#!/usr/bin/env bash
set -euo pipefail

if ! command -v cargo-llvm-cov >/dev/null 2>&1; then
  echo "cargo-llvm-cov is required. Run ./scripts/install-rust-test-tools.sh first." >&2
  exit 1
fi

MODE="both"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --html-only)
      MODE="html"
      shift
      ;;
    --lcov-only)
      MODE="lcov"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--html-only | --lcov-only]" >&2
      exit 1
      ;;
  esac
done

mkdir -p target/coverage

if [[ "$MODE" == "both" || "$MODE" == "html" ]]; then
  cargo llvm-cov \
    --workspace \
    --all-features \
    --exclude solver-wasm \
    --html \
    --output-dir target/coverage/rust-html
fi

if [[ "$MODE" == "both" || "$MODE" == "lcov" ]]; then
  cargo llvm-cov \
    --workspace \
    --all-features \
    --exclude solver-wasm \
    --lcov \
    --output-path target/coverage/rust.lcov
fi

echo "Rust coverage artifacts written under target/coverage/"
