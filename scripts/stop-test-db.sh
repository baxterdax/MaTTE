#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="mutte-test-db"

if command -v podman &>/dev/null; then
  RUNTIME="podman"
elif command -v docker &>/dev/null; then
  RUNTIME="docker"
else
  echo "[mutte:test-db] No podman or docker found; nothing to stop."
  exit 0
fi

if ${RUNTIME} ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}\$"; then
  echo "[mutte:test-db] Stopping and removing ${CONTAINER_NAME}..."
  ${RUNTIME} rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
else
  echo "[mutte:test-db] Container ${CONTAINER_NAME} not found; nothing to stop."
fi
