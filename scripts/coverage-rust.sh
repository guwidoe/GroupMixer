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
    --summary-only)
      MODE="summary"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      echo "Usage: $0 [--html-only | --lcov-only | --summary-only]" >&2
      exit 1
      ;;
  esac
done

mkdir -p target/coverage

COMMON_ARGS=(
  --workspace
  --all-features
  --exclude solver-wasm
  --exclude solver-cli
  --ignore-filename-regex '.*/src/main.rs'
)

FAIL_ARGS=()
if [[ -n "${RUST_COVERAGE_FAIL_UNDER_LINES:-}" ]]; then
  FAIL_ARGS+=(--fail-under-lines "$RUST_COVERAGE_FAIL_UNDER_LINES")
fi
if [[ -n "${RUST_COVERAGE_FAIL_UNDER_FUNCTIONS:-}" ]]; then
  FAIL_ARGS+=(--fail-under-functions "$RUST_COVERAGE_FAIL_UNDER_FUNCTIONS")
fi

if [[ "$MODE" == "both" || "$MODE" == "summary" || ${#FAIL_ARGS[@]} -gt 0 ]]; then
  cargo llvm-cov \
    "${COMMON_ARGS[@]}" \
    --summary-only \
    "${FAIL_ARGS[@]}" | tee target/coverage/rust-summary.txt
fi

if [[ "$MODE" == "both" || "$MODE" == "html" ]]; then
  cargo llvm-cov \
    "${COMMON_ARGS[@]}" \
    --html \
    --output-dir target/coverage/rust-html
fi

if [[ "$MODE" == "both" || "$MODE" == "lcov" ]]; then
  cargo llvm-cov \
    "${COMMON_ARGS[@]}" \
    --lcov \
    --output-path target/coverage/rust.lcov
fi

echo "Rust coverage artifacts written under target/coverage/"
