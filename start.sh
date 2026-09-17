#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
if ! command -v node >/dev/null 2>&1; then
  echo 'Install Node.js 22.13+ then run: npm ci --prefix backend' >&2
  exit 1
fi
exec node scripts/start.cjs
