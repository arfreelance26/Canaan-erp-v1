#!/usr/bin/env bash
# Cron wrapper for the daily Canaan ERP Drive backup.
# Resolves paths relative to itself so it works no matter where cron runs it from.
set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # backend/backup
BACKEND_DIR="$(dirname "$BACKUP_DIR")"                        # backend

# Prefer a project virtualenv if one exists, else fall back to python3 on PATH.
if [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
  PYTHON="$BACKEND_DIR/.venv/bin/python"
elif [ -x "$BACKEND_DIR/venv/bin/python" ]; then
  PYTHON="$BACKEND_DIR/venv/bin/python"
else
  PYTHON="$(command -v python3)"
fi

# Load Drive folder id / options from an env file if present (KEY=VALUE lines).
if [ -f "$BACKUP_DIR/backup.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$BACKUP_DIR/backup.env"
  set +a
fi

cd "$BACKEND_DIR"
exec "$PYTHON" backup/run_backup.py
