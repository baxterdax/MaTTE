# MuTTE - Multi-Tenant Transactional Email API

## Project Overview
MuTTE is a production-ready transactional email API designed for multi-tenant environments. It provides robust email sending capabilities with support for templating, delivery tracking, webhook notifications, rate limiting, and analytics.

## Technology Stack
- **Backend**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: Redis with Bull
- **Email**: Nodemailer with multiple provider support
- **Authentication**: JWT with API keys
- **Testing**: Jest and Supertest
- **Documentation**: OpenAPI/Swagger

## Project Structure
- `src/` - Source code
  - `api/` - API routes and controllers
  - `services/` - Business logic
  - `models/` - Database models
  - `middleware/` - Express middleware
  - `utils/` - Utility functions
  - `config/` - Configuration files
- `tests/` - Test files
- `prisma/` - Database schema and migrations
- `docs/` - API documentation

## Development Guidelines
- Use TypeScript strict mode
- Follow RESTful API design principles
- Implement proper error handling and logging
- Write comprehensive tests for all endpoints
- Use environment variables for configuration
- Implement rate limiting per tenant
- Support webhook callbacks for delivery status
- Maintain API versioning

## Setup Progress
- [x] Verify copilot-instructions.md file created
- [ ] Clarify Project Requirements
- [ ] Scaffold the Project
- [ ] Customize the Project
- [ ] Install Required Extensions
- [ ] Compile the Project
- [ ] Create and Run Task
- [ ] Ensure Documentation is Complete
