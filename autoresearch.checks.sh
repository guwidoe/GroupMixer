#!/usr/bin/env bash
set -euo pipefail

exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tools/autoresearch/solver3-metaheuristic-quality/autoresearch.checks.sh"
