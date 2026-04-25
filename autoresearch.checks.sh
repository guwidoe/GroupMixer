#!/usr/bin/env bash
set -euo pipefail

exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tools/autoresearch/solver3-construction/autoresearch.checks.sh"
