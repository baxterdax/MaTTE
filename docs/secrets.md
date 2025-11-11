# Secrets Management (Future Feature)

MuTTE will optionally integrate with external secrets managers so you can avoid storing sensitive SMTP credentials directly in the database or environment variables.

## Planned Adapters
- AWS Systems Manager Parameter Store (SSM)
- HashiCorp Vault (token or AppRole auth)

## Strategy
1. Tenant record may store a reference key (e.g., `smtp_secret_ref`).
2. On send, MuTTE resolves the reference via configured adapter.
3. Decrypted credentials cached in memory briefly (TTL configurable).

## Environment Variables (proposed)
```
SECRETS_PROVIDER=aws|vault
AWS_REGION=us-east-1
VAULT_ADDR=https://vault.example.com
VAULT_TOKEN=... (or VAULT_ROLE_ID / VAULT_SECRET_ID)
SECRETS_CACHE_TTL_MS=30000
```

## Example Reference
```
TENANT smtp_user_ref=ssm:/prod/tenantA/smtp_user
TENANT smtp_pass_ref=ssm:/prod/tenantA/smtp_pass
```

## Fallback
If adapter fails or is not configured, MuTTE uses locally stored encrypted values.

## Security Notes
- Minimize permission scope (least privilege).
- Rotate credentials regularly.
- Audit access patterns via provider logs.

> This feature is not implemented yet. Contributions welcome—open a proposal issue labeled `proposal`.