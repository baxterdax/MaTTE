import request from 'supertest';
import app from '../../src/index';
import { pool, query } from '../../src/db/pool';

describe('Template API Integration Tests', () => {
  // adminApiKey is provided via X-Admin-Key header directly in requests
  let tenantId: string;
  let testCounter = 0;

  beforeAll(async () => {
    // Set up test environment variables
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_API_KEY = 'test-admin-key';
    
    // Create a test tenant
    const tenantResult = await query(
      `INSERT INTO tenants (name, api_key, smtp_host, smtp_port, smtp_user, smtp_pass, from_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, api_key`,
      ['Test Tenant', 'test-tenant-key', 'smtp.test.com', '587', 'user@test.com', 'password', 'from@test.com']
    );
    
  tenantId = tenantResult.rows[0].id.toString();
  });

  afterAll(async () => {
    // Clean up test data
    await query('DELETE FROM tenant_templates WHERE tenant_id = $1', [tenantId]);
    await query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await pool.end();
  });

  beforeEach(async () => {
    // Increment counter for unique test slugs
    testCounter++;
    // Clean up templates between tests to avoid conflicts
    await query('DELETE FROM tenant_templates WHERE tenant_id = $1', [tenantId]);
  });

  describe('POST /admin/templates', () => {
    it('should create a new template successfully', async () => {
      const templateData = {
        tenantId: tenantId,
        name: 'Contact Form',
        slug: 'contact-form',
        engine: 'handlebars',
        content: '<h1>Contact from {{name}}</h1><p>{{message}}</p>',
        subjectTemplate: 'New contact from {{name}}',
        plaintextTemplate: 'Contact from {{name}}: {{message}}'
      };

      const response = await request(app)
        .post('/admin/templates')
        .set('X-Admin-Key', 'test-admin-key')
        .send(templateData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.templateId).toBeDefined();
      expect(response.body.message).toBe('Template created successfully');
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteData = {
        tenantId: tenantId,
        name: 'Incomplete Template'
        // Missing other required fields
      };

      const response = await request(app)
        .post('/admin/templates')
        .set('X-Admin-Key', 'test-admin-key')
        .send(incompleteData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Missing required fields');
    });

    it('should return 409 for duplicate slug', async () => {
      const templateData = {
        tenantId: tenantId,
        name: 'Duplicate Template',
        slug: 'duplicate-slug',
        engine: 'handlebars',
        content: '<div>Test</div>',
        subjectTemplate: 'Test'
      };

      // Create first template
      await request(app)
        .post('/admin/templates')
        .set('X-Admin-Key', 'test-admin-key')
        .send(templateData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/admin/templates')
        .set('X-Admin-Key', 'test-admin-key')
        .send(templateData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Template slug already exists');
    });

    it('should return 401 for missing admin key', async () => {
      const templateData = {
        tenantId: tenantId,
        name: 'Test Template',
        slug: 'test-template',
        engine: 'handlebars',
        content: '<div>Test</div>',
        subjectTemplate: 'Test'
      };

      const response = await request(app)
        .post('/admin/templates')
        .send(templateData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Admin key is required');
    });
  });

  describe('GET /admin/templates/:tenantId/:slug', () => {

    beforeEach(async () => {
      // Create a test template
      const templateData = {
        tenantId: tenantId,
        name: 'Test Template',
        slug: `test-get-template-${testCounter}`,
        engine: 'handlebars',
        content: '<div>Test content</div>',
        subjectTemplate: 'Test Subject'
      };

      await request(app)
        .post('/admin/templates')
        .set('X-Admin-Key', 'test-admin-key')
        .send(templateData)
        .expect(201);

      // created template is fetched by slug below; no need to store templateId here
    });

    it('should retrieve template by tenantId and slug', async () => {
      const response = await request(app)
        .get(`/admin/templates/${tenantId}/test-get-template-${testCounter}`)
        .set('X-Admin-Key', 'test-admin-key')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: 'Test Template',
        slug: `test-get-template-${testCounter}`,
        engine: 'handlebars',
        content: '<div>Test content</div>',
        subjectTemplate: 'Test Subject'
      });
    });

    it('should return 404 for non-existent template', async () => {
      const response = await request(app)
        .get(`/admin/templates/${tenantId}/non-existent`)
        .set('X-Admin-Key', 'test-admin-key')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Template not found');
    });
  });

  describe('GET /admin/templates/:tenantId', () => {
    beforeEach(async () => {
      // Create multiple test templates with unique slugs
      const templates = [
        {
          tenantId: tenantId,
          name: 'Template 1',
          slug: `template-1-${testCounter}`,
          engine: 'handlebars',
          content: '<div>Template 1</div>',
          subjectTemplate: 'Template 1 Subject'
        },
        {
          tenantId: tenantId,
          name: 'Template 2',
          slug: `template-2-${testCounter}`,
          engine: 'mjml',
          content: '<mjml><mj-body><mj-text>Template 2</mj-text></mj-body></mjml>',
          subjectTemplate: 'Template 2 Subject'
        }
      ];

      for (const template of templates) {
        await request(app)
          .post('/admin/templates')
          .set('X-Admin-Key', 'test-admin-key')
          .send(template)
          .expect(201);
      }
    });

    it('should list all templates for a tenant', async () => {
      const response = await request(app)
        .get(`/admin/templates/${tenantId}`)
        .set('X-Admin-Key', 'test-admin-key')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toHaveProperty('name');
      expect(response.body.data[0]).toHaveProperty('slug');
      expect(response.body.data[0]).toHaveProperty('engine');
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get(`/admin/templates/${tenantId}?page=1&limit=1`)
        .set('X-Admin-Key', 'test-admin-key')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 1,
        total: 2,
        pages: 2
      });
    });
  });

  describe('POST /admin/preview', () => {
    let templateId: string;

    beforeEach(async () => {
      const templateData = {
        tenantId: tenantId,
        name: 'Preview Template',
        slug: `preview-template-${testCounter}`,
        engine: 'handlebars',
        content: '<h1>Hello {{name}}!</h1><p>Your email is {{email}}</p>',
        subjectTemplate: 'Hello {{name}}!',
        plaintextTemplate: 'Hello {{name}}! Your email: {{email}}'
      };

      const response = await request(app)
        .post('/admin/templates')
        .set('X-Admin-Key', 'test-admin-key')
        .send(templateData)
        .expect(201);

      templateId = response.body.templateId;
    });

    it('should preview template by ID', async () => {
      const previewData = {
        templateId: templateId,
        templateData: {
          name: 'John Doe',
          email: 'john@example.com'
        }
      };

      const response = await request(app)
        .post('/admin/preview')
        .set('X-Admin-Key', 'test-admin-key')
        .send(previewData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.rendered).toMatchObject({
        subject: 'Hello John Doe!',
        html: expect.stringContaining('Hello John Doe!'),
        text: expect.stringContaining('Hello John Doe!')
      });
    });

    it('should preview template by tenantId and slug', async () => {
      const previewData = {
        tenantId: tenantId,
        slug: `preview-template-${testCounter}`,
        templateData: {
          name: 'Jane Smith',
          email: 'jane@example.com'
        }
      };

      const response = await request(app)
        .post('/admin/preview')
        .set('X-Admin-Key', 'test-admin-key')
        .send(previewData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.rendered.subject).toBe('Hello Jane Smith!');
    });

    it('should return 400 for missing templateData', async () => {
      const response = await request(app)
        .post('/admin/preview')
        .set('X-Admin-Key', 'test-admin-key')
        .send({ templateId: templateId })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('templateData is required');
    });
  });

  describe('PUT /admin/templates/:id', () => {
    let templateId: string;

    beforeEach(async () => {
      const templateData = {
        tenantId: tenantId,
        name: 'Update Template',
        slug: `update-template-${testCounter}`,
        engine: 'handlebars',
        content: '<div>Original content</div>',
        subjectTemplate: 'Original Subject'
      };

      const response = await request(app)
        .post('/admin/templates')
        .set('X-Admin-Key', 'test-admin-key')
        .send(templateData)
        .expect(201);

      templateId = response.body.templateId;
    });

    it('should update template fields', async () => {
      const updateData = {
        name: 'Updated Template Name',
        isActive: false
      };

      const response = await request(app)
        .put(`/admin/templates/${templateId}`)
        .set('X-Admin-Key', 'test-admin-key')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Template updated successfully');
    });

    it('should create new version when content is updated', async () => {
      const updateData = {
        content: '<div>Updated content</div>'
      };

      const response = await request(app)
        .put(`/admin/templates/${templateId}`)
        .set('X-Admin-Key', 'test-admin-key')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.versionCreated).toBe(true);
    });

    it('should return 404 for non-existent template', async () => {
      const response = await request(app)
        .put('/admin/templates/99999')
        .set('X-Admin-Key', 'test-admin-key')
        .send({ name: 'New Name' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Template not found');
    });
  });

  describe('DELETE /admin/templates/:id', () => {
    let templateId: string;

    beforeEach(async () => {
      const templateData = {
        tenantId: tenantId,
        name: 'Delete Template',
        slug: `delete-template-${testCounter}`,
        engine: 'handlebars',
        content: '<div>Delete me</div>',
        subjectTemplate: 'Delete Template'
      };

      const response = await request(app)
        .post('/admin/templates')
        .set('X-Admin-Key', 'test-admin-key')
        .send(templateData)
        .expect(201);

      templateId = response.body.templateId;
    });

    it('should soft delete template', async () => {
      const response = await request(app)
        .delete(`/admin/templates/${templateId}`)
        .set('X-Admin-Key', 'test-admin-key')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Template deleted successfully');

      // Verify template is no longer retrievable
      await request(app)
        .get(`/admin/templates/${tenantId}/delete-template-${testCounter}`)
        .set('X-Admin-Key', 'test-admin-key')
        .expect(404);
    });

    it('should return 404 for non-existent template', async () => {
      const response = await request(app)
        .delete('/admin/templates/99999')
        .set('X-Admin-Key', 'test-admin-key')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Template not found');
    });
  });

  describe('Rate Limiting', () => {
    it('should bypass rate limiting in test mode', async () => {
      const templateData = {
        tenantId: tenantId,
        name: 'Rate Limit Test',
        slug: `rate-limit-test-${testCounter}`,
        engine: 'handlebars',
        content: '<div>Test</div>',
        subjectTemplate: 'Test'
      };

      // Make multiple requests - should all succeed in test mode
      const promises = Array(15).fill(0).map(() =>
        request(app)
          .post('/admin/templates')
          .set('X-Admin-Key', 'test-admin-key')
          .send({ ...templateData, slug: `${templateData.slug}-${Math.random()}` })
      );

      const responses = await Promise.all(promises);
      
      // All requests should succeed (201 or 409 for duplicate) in test mode
      const successfulResponses = responses.filter(res => res.status === 201 || res.status === 409);
      expect(successfulResponses.length).toBe(15);
    });
  });
});
