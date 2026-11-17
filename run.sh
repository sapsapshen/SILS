#!/usr/bin/env bash
set -euo pipefail
cd /data/ms-cookbook
exec .venv-312/bin/python -u -m uvicorn app:app --host 0.0.0.0 --port 8899 --no-access-log
