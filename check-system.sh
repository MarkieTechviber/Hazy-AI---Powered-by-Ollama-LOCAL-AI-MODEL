#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js 22.13 or newer is required." >&2; exit 1; }
exec node scripts/doctor.cjs
