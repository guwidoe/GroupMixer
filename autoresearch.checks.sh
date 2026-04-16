#!/usr/bin/env bash
set -euo pipefail

exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tools/autoresearch/solver5-construction/autoresearch.checks.sh"
