# Email Templates

MuTTE provides a powerful, multi-tenant email template system with support for **Handlebars** and **MJML** rendering engines. Create, manage, preview, and use templates via a RESTful API.

## Quick Start

### 1. Create a Template
```bash
curl -X POST http://localhost:3000/admin/templates \
  -H "X-Admin-Key: your-admin-key" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "1",
    "name": "Welcome Email",
    "slug": "welcome-email",
    "engine": "handlebars",
    "content": "<h1>Welcome {{name}}!</h1><p>Your account is ready.</p>",
    "subjectTemplate": "Welcome {{name}}!"
  }'
```

### 2. Send Email Using Template
```bash
curl -X POST http://localhost:3000/send \
  -H "X-API-Key: tenant-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "1",
    "to": ["user@example.com"],
    "templateData": {
      "name": "Alice"
    }
  }'
```

## Template Engines

### Handlebars
Simple and powerful template engine with variable substitution and basic logic.

**Features:**
- Variables: `{{variableName}}`
- Conditionals: `{{#if condition}}...{{/if}}`
- Loops: `{{#each items}}...{{/each}}`
- Helpers: `{{#unless}}`, `{{#with}}`, etc.

**Example:**
```handlebars
<h1>Hello {{firstName}} {{lastName}}!</h1>
{{#if isPremium}}
  <p>Thank you for being a premium member!</p>
{{else}}
  <p>Upgrade to premium today!</p>
{{/if}}
```

### MJML
Responsive email framework that automatically compiles to optimized HTML for all email clients.

**Features:**
- Responsive columns and sections
- Automatic mobile optimization
- Built-in components (buttons, images, dividers, etc.)
- CSS inlining for better email client compatibility

**Example:**
```mjml
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text font-size="20px" align="center" color="#626262">
          Welcome {{name}}!
        </mj-text>
        <mj-button font-size="20px" background-color="#3498db">
          Get Started
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

## Template Management API

### Create Template
**POST** `/admin/templates`

**Headers:**
- `X-Admin-Key`: Admin authentication key
- `Content-Type: application/json`

**Request Body:**
```json
{
  "tenantId": "1",
  "name": "Welcome Email",
  "slug": "welcome-email",
  "engine": "handlebars",
  "content": "<h1>Welcome {{name}}!</h1>",
  "subjectTemplate": "Welcome {{name}}!",
  "plaintextTemplate": "Welcome {{name}}!"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Template created successfully",
  "templateId": "123"
}
```

**Constraints:**
- Template slug must be unique per tenant
- Content max size: 10KB
- Subject template max size: 500 characters
- Max 50 active templates per tenant

---

### Get Template
**GET** `/admin/templates/:tenantId/:slug`

**Headers:**
- `X-Admin-Key`: Admin authentication key

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": "123",
    "tenantId": "1",
    "name": "Welcome Email",
    "slug": "welcome-email",
    "engine": "handlebars",
    "content": "<h1>Welcome {{name}}!</h1>",
    "subjectTemplate": "Welcome {{name}}!",
    "plaintextTemplate": "Welcome {{name}}!",
    "version": 1,
    "isActive": true,
    "createdAt": "2025-11-12T10:00:00Z",
    "updatedAt": "2025-11-12T10:00:00Z"
  }
}
```

---

### List Templates
**GET** `/admin/templates/:tenantId?page=1&limit=10`

**Headers:**
- `X-Admin-Key`: Admin authentication key

**Query Parameters:**
- `page` (optional, default: 1) - Page number for pagination
- `limit` (optional, default: 10) - Results per page

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": "123",
      "name": "Welcome Email",
      "slug": "welcome-email",
      "engine": "handlebars",
      "isActive": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

---

### Update Template
**PUT** `/admin/templates/:id`

**Headers:**
- `X-Admin-Key`: Admin authentication key
- `Content-Type: application/json`

**Request Body (all fields optional):**
```json
{
  "name": "Updated Name",
  "engine": "mjml",
  "content": "<mjml>...</mjml>",
  "subjectTemplate": "Updated Subject {{name}}",
  "plaintextTemplate": "Updated plaintext",
  "isActive": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Template updated successfully",
  "versionCreated": true
}
```

**Note:** When content is updated, a new version is automatically created with version history maintained.

---

### Delete Template (Soft Delete)
**DELETE** `/admin/templates/:id`

**Headers:**
- `X-Admin-Key`: Admin authentication key

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Template deleted successfully"
}
```

**Note:** Soft delete marks the template as inactive but preserves version history.

---

### Preview Template
**POST** `/admin/preview`

**Headers:**
- `X-Admin-Key`: Admin authentication key
- `Content-Type: application/json`

**Request Body (by Template ID):**
```json
{
  "templateId": "123",
  "templateData": {
    "name": "Alice",
    "isPremium": true,
    "items": [
      { "id": 1, "title": "Item 1" },
      { "id": 2, "title": "Item 2" }
    ]
  }
}
```

**Request Body (by Tenant ID and Slug):**
```json
{
  "tenantId": "1",
  "slug": "welcome-email",
  "templateData": {
    "name": "Bob"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "rendered": {
      "subject": "Welcome Alice!",
      "html": "<h1>Welcome Alice!</h1>...",
      "text": "Welcome Alice!..."
    }
  }
}
```

## Using Templates in Send Endpoint

### Method 1: Template ID
```bash
curl -X POST http://localhost:3000/send \
  -H "X-API-Key: tenant-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "templateId": "123",
    "to": ["user@example.com"],
    "templateData": {
      "name": "Alice",
      "accountId": "456"
    }
  }'
```

### Method 2: Template Slug (resolved via tenantId from API key)
```bash
curl -X POST http://localhost:3000/send \
  -H "X-API-Key: tenant-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "templateSlug": "welcome-email",
    "to": ["user@example.com"],
    "templateData": {
      "name": "Bob"
    }
  }'
```

### Method 3: Legacy Direct Send (Backward Compatible)
```bash
curl -X POST http://localhost:3000/send \
  -H "X-API-Key: tenant-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["user@example.com"],
    "subject": "Hello",
    "htmlBody": "<p>Direct send</p>",
    "textBody": "Direct send"
  }'
```

## Template Variables

Template variables are provided via the `templateData` object in the send request.

**Simple Variable:**
```handlebars
Hello {{name}}
```

**Nested Variable:**
```handlebars
Hello {{user.firstName}} {{user.lastName}}
```

**Array Iteration:**
```handlebars
<ul>
{{#each items}}
  <li>{{this.title}} - ${{this.price}}</li>
{{/each}}
</ul>
```

**Conditional Logic:**
```handlebars
{{#if isVIP}}
  <p>VIP Pricing: $9.99/month</p>
{{else}}
  <p>Standard Pricing: $19.99/month</p>
{{/if}}
```

## Best Practices

### 1. Use Descriptive Slugs
✅ `order-confirmation`, `password-reset`, `weekly-digest`
❌ `email1`, `template2`, `msg`

### 2. Always Provide Plaintext
Email clients and accessibility tools benefit from plaintext versions. Set `plaintextTemplate` or it will be auto-generated.

### 3. Test with Preview Endpoint
Use the preview endpoint to validate templates before using them in production:
```bash
curl -X POST http://localhost:3000/admin/preview \
  -H "X-Admin-Key: admin-key" \
  -d '{
    "templateId": "123",
    "templateData": { "name": "Test User" }
  }'
```

### 4. Use MJML for Complex Layouts
MJML automatically handles responsive design and email client compatibility. Use Handlebars for simple variable substitution only.

### 5. Organize by Category
Consider slugs like: `auth/password-reset`, `orders/confirmation`, `marketing/weekly-digest`

## Limitations

- Max 50 active templates per tenant
- Content limited to 10KB
- Subject template limited to 500 characters
- No conditional email sending (send or not based on variables)
- No external template inheritance

## Examples

### Example 1: E-commerce Order Confirmation
```handlebars
<h1>Order Confirmed!</h1>
<p>Hi {{customer.firstName}},</p>
<p>Your order #{{orderId}} has been confirmed.</p>

<h2>Items:</h2>
<ul>
{{#each items}}
  <li>
    {{this.name}} × {{this.quantity}} = ${{this.total}}
  </li>
{{/each}}
</ul>

<p><strong>Total: ${{total}}</strong></p>
<p>Estimated delivery: {{estimatedDate}}</p>
```

### Example 2: Responsive MJML Newsletter
```mjml
<mjml>
  <mj-body>
    <mj-section background-color="#f4f4f4">
      <mj-column>
        <mj-image width="200px" src="https://example.com/logo.png" />
      </mj-column>
    </mj-section>
    
    <mj-section>
      <mj-column>
        <mj-text font-size="20px">
          {{weekNumber}} Week Digest
        </mj-text>
        <mj-text color="#525252">
          Hi {{firstName}}, here's what you missed this week:
        </mj-text>
      </mj-column>
    </mj-section>

    {{#each articles}}
    <mj-section>
      <mj-column>
        <mj-text font-size="18px">
          {{this.title}}
        </mj-text>
        <mj-text color="#626262">
          {{this.excerpt}}
        </mj-text>
        <mj-button href="{{this.url}}">
          Read More
        </mj-button>
      </mj-column>
    </mj-section>
    {{/each}}
  </mj-body>
</mjml>
```

## Troubleshooting

**Template returns 404:**
- Verify the slug matches exactly (case-sensitive)
- Ensure the tenantId is correct
- Check that the template is active (not deleted)

**Variables not replacing:**
- Verify variable names match exactly in templateData
- Use `{{debug}}` in Handlebars to inspect variables
- Preview the template to see rendered output

**MJML rendering issues:**
- Validate MJML syntax (must be well-formed XML)
- Check for missing closing tags
- Review MJML documentation for available components

**Performance issues:**
- Templates are cached after first use
- Check cache stats via internal admin endpoint
- Limit template size to reduce rendering time
