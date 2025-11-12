# Testing Strategy

This document explains how to run the MuTTE test suite, including database-backed integration tests using a real Postgres instance. It is designed to work with both Podman and Docker.

## Overview

MuTTE uses three layers of tests:

1. Unit tests
   - Fast, in-memory.
   - No external services.
   - Examples: template utils, encryption, TemplateRenderer internals.

2. Integration tests
   - Use the real Express app and a real Postgres database.
   - Validate migrations, queries, routes, middleware, and behavior end-to-end.
   - Example: Template API tests in `tests/api/templates.test.ts`.

3. Health / behavior checks
   - Simple endpoint tests like `/health` and `/send` to ensure core behavior and backward compatibility.

We deliberately DO NOT mock the database for integration tests. Instead, we spin up a real Postgres instance in a container for accurate, production-like coverage. This aligns with common industry practice.

## Test Commands

### Run all tests (requires test DB for integration suites)

```bash
npm test
```

If the integration DB is not running, DB-backed tests (like `templates.test.ts`) will fail with connection errors (e.g. `getaddrinfo EAI_AGAIN db`). See “Integration Test DB Setup” below.

### Run only unit tests

If you want to run only fast/unit tests (no external DB), you can use Jest’s `testPathPattern`:

```bash
npm test -- --runInBand --testPathPattern="(utils|health|send\.)"
```

(You can refine this pattern as needed; a dedicated unit test script can be added later.)

### Run specific suites

Examples:

```bash
# Template renderer unit tests
npm test -- --runInBand --testPathPattern=templateRenderer.test.ts

# Template API integration tests (requires test DB)
npm test -- --runInBand --testPathPattern=templates.test.ts
```

## Integration Test DB Setup

Integration tests for templates expect a reachable Postgres instance. To keep this reliable and consistent across environments, use the provided helper scripts.

We support both Podman and Docker:

- Prefer Podman if available.
- Fallback to Docker if Podman is not found.

### Start test database

```bash
./scripts/start-test-db.sh
```

This will:

- Detect `podman` or `docker`.
- Start a Postgres 16 container named `mutte-test-db`.
- Expose it on `localhost:5433` by default.
- Create database/user:
  - `MUTTE_TEST_DB_NAME` (default: `mutte_test`)
  - `MUTTE_TEST_DB_USER` (default: `mutte`)
  - `MUTTE_TEST_DB_PASSWORD` (default: `mutte`)

You should then configure your test environment (e.g. via `.env.test` or env vars) so that MuTTE connects to this instance. For example:

```bash
export PGHOST=localhost
export PGPORT=5433
export PGUSER=mutte
export PGPASSWORD=mutte
export PGDATABASE=mutte_test
```

With these set, the integration tests (including `tests/api/templates.test.ts`) will run against the real test DB.

### Stop test database

```bash
./scripts/stop-test-db.sh
```

This will:

- Detect `podman` or `docker`.
- Stop and remove the `mutte-test-db` container if it exists.

### Notes

- The helper scripts are idempotent for local use:
  - `start-test-db.sh` recreates the container each time to ensure a clean environment.
  - `stop-test-db.sh` is safe to run even if the container does not exist.
- In CI:
  - You can call `./scripts/start-test-db.sh` in your workflow before `npm test`.
  - Or reuse your existing container orchestration but keep the same connection parameters.

## Why real DB (not mocks) for integration tests?

We intentionally use a real Postgres instance for:

- Verifying migrations and schema (`tenant_templates`, etc.).
- Ensuring SQL queries and constraints behave as expected.
- Catching issues that mocks would hide (indexes, foreign keys, nullability, etc.).
- Providing confidence that the template APIs work in a realistic environment.

This is a standard and recommended pattern:

- Unit tests: mock everything external.
- Integration tests: real app + real DB (via disposable containers).
- E2E: full stack if needed.

By using the provided scripts and environment variables, you get reproducible, deterministic integration tests without manual DB setup.
