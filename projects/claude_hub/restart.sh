#!/usr/bin/env bash
# Source-package restart, including updates initiated by pre-3.1.31 Unix clients.
# Uses the installation's own Node and supervisor; no global PM2 dependency.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
source "$ROOT/scripts/node-env.sh"
exec "$NODE_EXE" "$ROOT/scripts/restart-update.js" "${PORT:-8970}" --legacy
