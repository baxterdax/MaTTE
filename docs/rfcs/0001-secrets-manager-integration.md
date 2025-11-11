# RFC-0001: Secrets Manager Integration

Status: Draft
Author: Maintainers
Target: v1.1

## Summary
Add optional integration with external secrets managers (AWS SSM, HashiCorp Vault) to retrieve SMTP credentials at send-time.

## Motivation
- Reduce risk of storing long-lived SMTP credentials in DB.
- Improve security posture for high-compliance deployments.

## Goals
- Pluggable provider API.
- Transparent fallback to DB-encrypted values.
- Minimal runtime overhead with short cache.

## Non-Goals
- No provider-specific ACL management.
- No automatic rotation (out of scope initially).

## Design
- New module `src/utils/secrets.ts` with interface:
  - `getSecret(name: string): Promise<string | undefined>`
  - Providers: `env` (default), `aws-ssm` (future), `vault` (future)
- Tenant schema: allow `_ref` fields (e.g., `smtp_user_ref`). If present, prefer resolving ref over stored value.
- Config via environment variables (see docs/secrets.md).

## Security
- Enforce TLS to providers.
- Do not log secrets.
- Cache duration configurable; defaults to 30s.

## Migration
- Add columns: `smtp_user_ref`, `smtp_pass_ref` (optional; future migration).

## Alternatives
- Stick with DB-encrypted only (simpler, less flexible).

## Rollout
- Phase 1: Stub + docs.
- Phase 2: AWS SSM adapter.
- Phase 3: Vault adapter.

## Testing
- Unit tests for `env` provider.
- Mocked tests for SSM/Vault.

## Open Questions
- Per-tenant provider selection vs. global
- Cache invalidation hooks