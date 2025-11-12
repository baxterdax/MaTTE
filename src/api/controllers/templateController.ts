import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { query, pool } from '../../db/pool';
import { TemplateRenderer, TemplateRecord, TemplateData, RenderResult } from '../../utils/templateRenderer';

export interface CreateTemplateRequest {
  tenantId: string;
  name: string;
  slug: string;
  engine: 'handlebars' | 'mjml';
  content: string;
  subjectTemplate: string;
  plaintextTemplate?: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  engine?: 'handlebars' | 'mjml';
  content?: string;
  subjectTemplate?: string;
  plaintextTemplate?: string;
  isActive?: boolean;
}

export interface PreviewTemplateRequest {
  templateId?: string;
  tenantId?: string;
  slug?: string;
  templateData: TemplateData;
  version?: number;
}

export const createTemplate = async (
  req: AuthRequest & { body: CreateTemplateRequest },
  res: Response,
  next: NextFunction
) => {
  const client = await pool.connect();
  
  try {
    const { tenantId, name, slug, engine, content, subjectTemplate, plaintextTemplate } = req.body;

    // Validation
    if (!tenantId || !name || !slug || !engine || !content || !subjectTemplate) {
      throw new AppError('Missing required fields: tenantId, name, slug, engine, content, subjectTemplate', 400);
    }

    if (!['handlebars', 'mjml'].includes(engine)) {
      throw new AppError('Engine must be "handlebars" or "mjml"', 400);
    }

    if (content.length > 10240) { // 10KB limit
      throw new AppError('Content exceeds 10KB limit', 400);
    }

    if (subjectTemplate.length > 500) {
      throw new AppError('Subject template exceeds 500 character limit', 400);
    }

    if (plaintextTemplate && plaintextTemplate.length > 10240) {
      throw new AppError('Plaintext template exceeds 10KB limit', 400);
    }

    // Check slug uniqueness per tenant
    const existingTemplate = await client.query(
      'SELECT id FROM tenant_templates WHERE tenant_id = $1 AND slug = $2 AND version = 1',
      [tenantId, slug]
    );

    if (existingTemplate.rows.length > 0) {
      throw new AppError('Template slug already exists for this tenant', 409);
    }

    // Check template count limit per tenant (50 templates)
    const templateCount = await client.query(
      'SELECT COUNT(*) as count FROM tenant_templates WHERE tenant_id = $1 AND is_active = true',
      [tenantId]
    );

    if (parseInt(templateCount.rows[0].count) >= 50) {
      throw new AppError('Tenant has reached the maximum of 50 templates', 429);
    }

    // Start transaction
    await client.query('BEGIN');

    // Create new template
    const result = await client.query(
      `INSERT INTO tenant_templates (
        tenant_id, name, slug, engine, content, subject_template, plaintext_template, version, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [tenantId, name, slug, engine, content, subjectTemplate, plaintextTemplate || null, 1, true]
    );

    const templateId = result.rows[0].id;

    // Commit transaction
    await client.query('COMMIT');

    logger.info(`Template created: ${slug} for tenant ${tenantId}`);

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      templateId: templateId.toString()
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

export const getTemplate = async (
  req: AuthRequest & { params: { tenantId: string; slug: string } },
  res: Response,
  next: NextFunction
) => {
  try {
    const { tenantId, slug } = req.params;
    const version = req.query.version ? parseInt(req.query.version as string) : undefined;

    let queryText = `
      SELECT id, tenant_id, name, slug, engine, content, subject_template, plaintext_template, 
             version, is_active, created_at, updated_at
      FROM tenant_templates 
      WHERE tenant_id = $1 AND slug = $2 AND is_active = true
    `;
    const queryParams: any[] = [tenantId, slug];

    if (version) {
      queryText += ' AND version = $3';
      queryParams.push(version);
    } else {
      queryText += ' ORDER BY version DESC LIMIT 1';
    }

    const result = await query(queryText, queryParams);

    if (result.rows.length === 0) {
      throw new AppError('Template not found', 404);
    }

    const template = result.rows[0];

    res.json({
      success: true,
      data: {
        id: template.id,
        name: template.name,
        slug: template.slug,
        engine: template.engine,
        content: template.content,
        subjectTemplate: template.subject_template,
        plaintextTemplate: template.plaintext_template,
        version: template.version,
        isActive: template.is_active,
        createdAt: template.created_at,
        updatedAt: template.updated_at
      }
    });

  } catch (error) {
    next(error);
  }
};

export const updateTemplate = async (
  req: AuthRequest & { params: { id: string }, body: UpdateTemplateRequest },
  res: Response,
  next: NextFunction
) => {
  const client = await pool.connect();
  
  try {
    const templateId = parseInt(req.params.id);
    const updates = req.body;

    // Validate template exists
    const existingTemplate = await client.query(
      'SELECT * FROM tenant_templates WHERE id = $1',
      [templateId]
    );

    if (existingTemplate.rows.length === 0) {
      throw new AppError('Template not found', 404);
    }

    const currentTemplate = existingTemplate.rows[0];
    const updates_list: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build dynamic update query
    if (updates.name !== undefined) {
      updates_list.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }

    if (updates.engine !== undefined) {
      if (!['handlebars', 'mjml'].includes(updates.engine)) {
        throw new AppError('Engine must be "handlebars" or "mjml"', 400);
      }
      updates_list.push(`engine = $${paramCount++}`);
      values.push(updates.engine);
    }

    if (updates.content !== undefined) {
      if (updates.content.length > 10240) {
        throw new AppError('Content exceeds 10KB limit', 400);
      }
      updates_list.push(`content = $${paramCount++}`);
      values.push(updates.content);
    }

    if (updates.subjectTemplate !== undefined) {
      if (updates.subjectTemplate.length > 500) {
        throw new AppError('Subject template exceeds 500 character limit', 400);
      }
      updates_list.push(`subject_template = $${paramCount++}`);
      values.push(updates.subjectTemplate);
    }

    if (updates.plaintextTemplate !== undefined) {
      if (updates.plaintextTemplate && updates.plaintextTemplate.length > 10240) {
        throw new AppError('Plaintext template exceeds 10KB limit', 400);
      }
      updates_list.push(`plaintext_template = $${paramCount++}`);
      values.push(updates.plaintextTemplate || null);
    }

    if (updates.isActive !== undefined) {
      updates_list.push(`is_active = $${paramCount++}`);
      values.push(updates.isActive);
    }

    if (updates_list.length === 0) {
      throw new AppError('No valid updates provided', 400);
    }

    // If content or engine is being updated, create a new version
    const isVersionUpdate = updates.content !== undefined || updates.engine !== undefined;
    
    if (isVersionUpdate) {
      // Start transaction
      await client.query('BEGIN');

      // Get next version number
      const versionResult = await client.query(
        'SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM tenant_templates WHERE tenant_id = $1 AND slug = $2',
        [currentTemplate.tenant_id, currentTemplate.slug]
      );
      const nextVersion = versionResult.rows[0].next_version;

      // Create new version
      await client.query(
        `INSERT INTO tenant_templates (
          tenant_id, name, slug, engine, content, subject_template, plaintext_template, version, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          currentTemplate.tenant_id,
          updates.name || currentTemplate.name,
          currentTemplate.slug,
          updates.engine || currentTemplate.engine,
          updates.content || currentTemplate.content,
          updates.subjectTemplate || currentTemplate.subject_template,
          updates.plaintextTemplate !== undefined ? updates.plaintextTemplate : currentTemplate.plaintext_template,
          nextVersion,
          updates.isActive !== undefined ? updates.isActive : currentTemplate.is_active
        ]
      );

      // Invalidate template cache
      TemplateRenderer.invalidateTemplateCache(templateId.toString());

      // Commit transaction
      await client.query('COMMIT');

    } else {
      // Simple update without versioning
      values.push(templateId);
      
      await client.query(
        `UPDATE tenant_templates SET ${updates_list.join(', ')}, updated_at = NOW() WHERE id = $${paramCount}`,
        values
      );
    }

    logger.info(`Template updated: ${currentTemplate.slug} (ID: ${templateId})`);

    res.json({
      success: true,
      message: 'Template updated successfully',
      versionCreated: isVersionUpdate
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

export const deleteTemplate = async (
  req: AuthRequest & { params: { id: string } },
  res: Response,
  next: NextFunction
) => {
  try {
    const templateId = parseInt(req.params.id);

    // Validate template exists
    const existingTemplate = await query(
      'SELECT tenant_id, slug FROM tenant_templates WHERE id = $1',
      [templateId]
    );

    if (existingTemplate.rows.length === 0) {
      throw new AppError('Template not found', 404);
    }

    // Soft delete by setting is_active to false
    await query(
      'UPDATE tenant_templates SET is_active = false, updated_at = NOW() WHERE id = $1',
      [templateId]
    );

    // Invalidate template cache
    TemplateRenderer.invalidateTemplateCache(templateId.toString());

    logger.info(`Template deleted: ${existingTemplate.rows[0].slug} (ID: ${templateId})`);

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

export const listTemplates = async (
  req: AuthRequest & { params: { tenantId: string } },
  res: Response,
  next: NextFunction
) => {
  try {
    const { tenantId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) as total FROM tenant_templates WHERE tenant_id = $1 AND is_active = true',
      [tenantId]
    );
    const total = parseInt(countResult.rows[0].total);

    // Get templates (latest version for each slug)
    const templatesResult = await query(
      `SELECT DISTINCT ON (slug) id, name, slug, engine, version, is_active, created_at, updated_at
       FROM tenant_templates 
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY slug, version DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );

    res.json({
      success: true,
      data: templatesResult.rows.map(template => ({
        id: template.id,
        name: template.name,
        slug: template.slug,
        engine: template.engine,
        version: template.version,
        isActive: template.is_active,
        createdAt: template.created_at,
        updatedAt: template.updated_at
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    next(error);
  }
};

export const previewTemplate = async (
  req: AuthRequest & { body: PreviewTemplateRequest },
  res: Response,
  next: NextFunction
) => {
  try {
    const { templateId, tenantId, slug, templateData, version } = req.body;

    if (!templateData) {
      throw new AppError('templateData is required', 400);
    }

    let templateRecord: TemplateRecord;

    if (templateId) {
      // Get template by ID
      const result = await query(
        'SELECT * FROM tenant_templates WHERE id = $1 AND is_active = true',
        [templateId]
      );

      if (result.rows.length === 0) {
        throw new AppError('Template not found', 404);
      }

      const template = result.rows[0];
      templateRecord = {
        id: template.id.toString(),
        tenant_id: template.tenant_id.toString(),
        name: template.name,
        slug: template.slug,
        engine: template.engine,
        content: template.content,
        subject_template: template.subject_template,
        plaintext_template: template.plaintext_template,
        version: template.version,
        is_active: template.is_active
      };

    } else if (tenantId && slug) {
      // Get template by tenant and slug
      let queryText = `
        SELECT * FROM tenant_templates 
        WHERE tenant_id = $1 AND slug = $2 AND is_active = true
      `;
      const queryParams: any[] = [tenantId, slug];

      if (version) {
        queryText += ' AND version = $3 ORDER BY version DESC LIMIT 1';
        queryParams.push(version);
      } else {
        queryText += ' ORDER BY version DESC LIMIT 1';
      }

      const result = await query(queryText, queryParams);

      if (result.rows.length === 0) {
        throw new AppError('Template not found', 404);
      }

      const template = result.rows[0];
      templateRecord = {
        id: template.id.toString(),
        tenant_id: template.tenant_id.toString(),
        name: template.name,
        slug: template.slug,
        engine: template.engine,
        content: template.content,
        subject_template: template.subject_template,
        plaintext_template: template.plaintext_template,
        version: template.version,
        is_active: template.is_active
      };

    } else {
      throw new AppError('Either templateId or (tenantId and slug) must be provided', 400);
    }

    // Render template
    const renderedResult: RenderResult = await TemplateRenderer.renderTemplate(
      templateRecord,
      templateData,
      version
    );

    logger.info(`Template preview generated: ${templateRecord.slug}`);

    res.json({
      success: true,
      data: {
        template: {
          id: templateRecord.id,
          name: templateRecord.name,
          slug: templateRecord.slug,
          engine: templateRecord.engine,
          version: templateRecord.version
        },
        rendered: renderedResult
      }
    });

  } catch (error) {
    next(error);
  }
};
