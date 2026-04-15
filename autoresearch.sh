#!/usr/bin/env bash
set -euo pipefail

exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tools/autoresearch/solver4-8x4x10/autoresearch.sh"
