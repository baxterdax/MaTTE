#!/usr/bin/env bash
set -euo pipefail

# Start a disposable Postgres container for integration tests.
# - Detects podman or docker.
# - Uses a fixed name so tests can target host "db" consistently.
# - Safe to run multiple times: recreates container if needed.
#
# Usage:
#   ./scripts/start-test-db.sh
#
# Environment (override as needed):
: "${MUTTE_TEST_DB_NAME:=mutte_test}"
: "${MUTTE_TEST_DB_USER:=mutte}"
: "${MUTTE_TEST_DB_PASSWORD:=mutte}"
: "${MUTTE_TEST_DB_PORT:=5433}"

CONTAINER_NAME="mutte-test-db"

# Detect container runtime
if command -v podman &>/dev/null; then
  RUNTIME="podman"
elif command -v docker &>/dev/null; then
  RUNTIME="docker"
else
  echo "Error: neither podman nor docker found. Install one to run integration DB tests." >&2
  exit 1
fi

echo "[mutte:test-db] Using runtime: ${RUNTIME}"

# If container exists, remove it (fresh start)
if ${RUNTIME} ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}\$"; then
  echo "[mutte:test-db] Removing existing container ${CONTAINER_NAME}..."
  ${RUNTIME} rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
fi

# Run new Postgres container
echo "[mutte:test-db] Starting Postgres container ${CONTAINER_NAME}..."
${RUNTIME} run -d \
  --name "${CONTAINER_NAME}" \
  -e POSTGRES_DB="${MUTTE_TEST_DB_NAME}" \
  -e POSTGRES_USER="${MUTTE_TEST_DB_USER}" \
  -e POSTGRES_PASSWORD="${MUTTE_TEST_DB_PASSWORD}" \
  -p "${MUTTE_TEST_DB_PORT}:5432" \
  postgres:16-alpine >/dev/null

# Wait for Postgres to be ready
echo "[mutte:test-db] Waiting for Postgres to become ready..."
for i in {1..30}; do
  if ${RUNTIME} exec "${CONTAINER_NAME}" pg_isready -U "${MUTTE_TEST_DB_USER}" >/dev/null 2>&1; then
    echo "[mutte:test-db] Postgres is ready."
    exit 0
  fi
  sleep 1
done

echo "[mutte:test-db] Postgres did not become ready in time. Logs:"
${RUNTIME} logs "${CONTAINER_NAME}" || true
exit 1
