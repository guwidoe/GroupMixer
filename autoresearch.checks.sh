#!/usr/bin/env bash
set -euo pipefail

uv run python -m ast tools/autoresearch/solver6-optimality/generate_matrix_report.py >/dev/null
cargo test -q -p gm-core solver6 --no-fail-fast >/dev/null
