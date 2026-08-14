#!/usr/bin/env bash
# Runs on the production box after a fast-forward of main.
set -euo pipefail

ROOT="${AGORA_ROOT:-/home/dperussina/AGORA}"
cd "$ROOT"

git fetch origin
git checkout main
git pull --ff-only origin main
npm ci
pm2 restart agora
