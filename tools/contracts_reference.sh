#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Usage:
  ./tools/contracts_reference.sh generate
  ./tools/contracts_reference.sh check

Commands:
  generate  Regenerate docs/reference/generated/solver-contracts from solver-contracts
  check     Fail if generated contract reference artifacts are stale or missing
EOF
}

cmd="${1:-}"
case "$cmd" in
  generate)
    cargo run -p solver-contracts --bin generate-reference
    ;;
  check)
    cargo run -p solver-contracts --bin generate-reference -- --check
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
