# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within MuTTE, please send an email to the maintainers. All security vulnerabilities will be promptly addressed.

## Known Security Considerations

### MJML Dependency (html-minifier)

**Status**: Accepted Risk

MuTTE uses MJML 4.16.1 (latest stable) for responsive email template rendering. MJML has a transitive dependency on `html-minifier` which contains a Regular Expression Denial of Service (REDoS) vulnerability (GHSA-pfq8-rq6v-vf5m).

**Why this is low-risk for MuTTE**:
- The vulnerability requires malicious template content to trigger
- Templates are only created by authenticated administrators via the `/admin/templates` endpoint
- Email recipients and tenant API users cannot inject template content
- If an admin account is compromised to exploit this, they already have full system access
- MJML is widely used in production by major email service providers with the same limitation

**Mitigation**:
- Restrict admin API key access to trusted personnel only
- Monitor template creation logs for suspicious activity
- Consider using the Handlebars engine instead of MJML for new templates

**Future resolution**:
- MJML 5.x (currently in alpha) will address this vulnerability
- We will upgrade to MJML 5.x stable when released

### Dependency Security

We actively monitor and address security vulnerabilities in our dependencies:
- Run `npm audit` regularly to check for new vulnerabilities
- Apply security patches for moderate and higher severity issues
- Accept low-severity issues when the risk is negligible in our architecture

### Authentication

- Admin API keys should be rotated regularly
- Tenant API keys are unique per tenant and can be regenerated
- All API keys should be stored securely (environment variables, secrets manager)
- Never commit API keys to version control

### SMTP Credentials

- Tenant SMTP credentials are encrypted at rest using AES-256-GCM
- Encryption keys should be stored in a secure secrets manager
- Follow your organization's key rotation policies

## Security Best Practices

1. **Environment Variables**: Use `.env` files for configuration, never commit them
2. **HTTPS Only**: Always use HTTPS in production for API endpoints
3. **Rate Limiting**: Built-in rate limiting is enabled by default per tenant
4. **Input Validation**: All API endpoints validate input, but sanitize email content
5. **Database Security**: Use PostgreSQL with proper authentication and network isolation
6. **Container Security**: Keep base images updated, run containers as non-root user
