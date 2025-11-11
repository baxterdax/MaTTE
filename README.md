# Welcome to MaTTE: Your Multi-Tenant Email Solution

MaTTE (Multi-Tenant Transactional Email API) is your go-to solution for managing transactional emails across multiple clients. Whether you're an agency or a developer, MaTTE simplifies email sending while ensuring security and scalability.

## Why Choose MaTTE?

- **Secure and Reliable**: Each tenant's SMTP credentials are securely encrypted.
- **Flexible Integration**: Works seamlessly with any SMTP provider.
- **Developer-Friendly**: Includes examples for quick integration.
- **Scalable**: Built with PostgreSQL and Docker for high performance.

## Getting Started

### Prerequisites

Before you begin, ensure you have:
- Node.js 20+
- PostgreSQL 14+
- Docker (optional, for containerized deployment)

### Installation Steps

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd matte
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Initialize the Database**
   ```bash
   createdb mattedb
   psql mattedb < db/schema.sql
   ```

5. **Start the Server**
   ```bash
   npm run dev
   ```
   Your API is now live at `http://localhost:3000`.

### Docker Deployment

Prefer containers? Use Docker:
```bash
docker-compose up -d
```

## Features at a Glance

- **Tenant Management**: Add, update, and manage tenants effortlessly.
- **Email Sending**: Send emails with ease using simple API endpoints.
- **Rate Limiting**: Prevent abuse with configurable limits.
- **Logging**: Track email statuses and troubleshoot issues.

## Example Use Case

Imagine you're managing email campaigns for multiple clients. With MaTTE, you can:
1. Add each client as a tenant.
2. Store their SMTP credentials securely.
3. Use the API to send emails on their behalf.

## API Overview

### Authentication

Every request requires an API key:
- **Tenant Key**: `X-API-Key`
- **Admin Key**: `X-Admin-Key`

### Key Endpoints

#### Send an Email
```http
POST /send
Content-Type: application/json
X-API-Key: tenant_api_key

{
  "to": "recipient@example.com",
  "subject": "Hello!",
  "htmlBody": "<h1>Welcome!</h1>"
}
```

#### List Emails
```http
GET /emails?page=1&limit=20
X-API-Key: tenant_api_key
```

For a full list of endpoints, check the [API Documentation](docs/).

## Need Help?

If you run into issues:
1. Check the [Troubleshooting Guide](#troubleshooting).
2. Review the logs in `logs/`.
3. Open an issue on GitHub.

## Join the Community

We'd love your contributions! Fork the repo, make your changes, and submit a pull request. Together, we can make MaTTE even better.

---

Ready to get started? Dive in and simplify your email management with MaTTE!