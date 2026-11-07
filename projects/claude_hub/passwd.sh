#!/usr/bin/env bash
# Reset the Clootee access password from the server command line.
# Use this when the password is forgotten and the web UI cannot be entered.
#   ./passwd.sh set <new-password>   set / change the access password (no old password needed)
#   ./passwd.sh clear                remove the access password (local use only)
#   ./passwd.sh status               show whether a password is set
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$DIR/backend"
ENTRY="$BACKEND/dist/cli/authctl.js"

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 set <new-password> | clear | status"
  exit 1
fi
if [ ! -f "$ENTRY" ]; then
  echo "Build output not found: $ENTRY"
  echo "Run 'npm run build' in $BACKEND first."
  exit 1
fi

NODE_BIN="${NODE_EXE:-}"
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(command -v node || true)"
fi
if [ -z "$NODE_BIN" ] && [ -x /usr/local/node24/bin/node ]; then
  NODE_BIN=/usr/local/node24/bin/node
fi
if [ -z "$NODE_BIN" ]; then
  echo "node not found; set NODE_EXE=/path/to/node"
  exit 1
fi

# When run as root, write as the account that owns the app data, otherwise the
# 0600 auth.json would become unreadable by the running service.
if [ "$(id -u)" = "0" ] && id claudeuser >/dev/null 2>&1; then
  exec runuser -u claudeuser -- "$NODE_BIN" "$ENTRY" "$@"
fi
exec "$NODE_BIN" "$ENTRY" "$@"
