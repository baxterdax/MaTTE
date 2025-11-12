import { Response, NextFunction } from 'express';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { query, pool } from '../../db/pool';
import { decrypt } from '../../utils/encryption';
import { renderTemplate } from '../../utils/template';
import { sendWebhook } from '../../utils/webhook';
import { TemplateRenderer, TemplateRecord, TemplateData } from '../../utils/templateRenderer';

// Runtime import to avoid TypeScript issues
function getNodemailer() {
  try {
    // dynamic require avoids ESM/CJS interop issues without adding a top-level import
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('nodemailer');
  } catch (error) {
    logger.error('Failed to import nodemailer:', error);
    throw new Error('Email service unavailable');
  }
}

// Helper function to resolve template by slug
async function resolveTemplate(
  tenantId: string, 
  slug: string, 
  version?: number
): Promise<TemplateRecord | null> {
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
    return null;
  }

  const template = result.rows[0];
  return {
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
}

// Helper function to render template or fallback
async function renderEmailContent(
  mode: 'legacy' | 'template',
  data: any,
  templateRecord?: TemplateRecord,
  templateData?: TemplateData
) {
  if (mode === 'template' && templateRecord && templateData) {
    try {
      const rendered = await TemplateRenderer.renderTemplate(templateRecord, templateData);
      return {
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        rendered: true
      };
    } catch (error) {
      logger.error('Template rendering failed, falling back to legacy mode:', error);
      // Fallback to legacy mode if template rendering fails
      return {
        subject: data.subject || 'Email',
        html: data.htmlBody ? renderTemplate(data.htmlBody, data.variables) : '',
        text: data.textBody ? renderTemplate(data.textBody, data.variables) : '',
        rendered: false,
        fallback: true
      };
    }
  } else {
    // Legacy mode
    return {
      subject: data.subject || 'Email',
      html: data.htmlBody ? renderTemplate(data.htmlBody, data.variables) : '',
      text: data.textBody ? renderTemplate(data.textBody, data.variables) : '',
      rendered: false
    };
  }
}

export const sendEmail = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  const client = await pool.connect();
  let logId: number | null = null;
  
  try {
    const body = req.body;
    
    // Determine send mode: legacy or template-based
    const isTemplateMode = Boolean(body.templateSlug);
    
    if (isTemplateMode) {
      // Template-based mode
      const { 
        templateSlug, 
        templateData, 
        to, 
        from, 
        replyTo, 
        cc, 
        bcc, 
        version,
        overrides 
      } = body;

      if (!templateSlug || !templateData || !to) {
        throw new AppError('Missing required fields for template mode: templateSlug, templateData, to', 400);
      }

      // Get tenant information from the request (set by auth middleware)
      const tenant = req.tenant;
      if (!tenant) {
        throw new AppError('Tenant not found', 401);
      }

      // Resolve template
      const templateRecord = await resolveTemplate(tenant.id, templateSlug, version);
      if (!templateRecord) {
        throw new AppError(`Template not found: ${templateSlug}`, 404);
      }

      // Render email content using template
      const renderedContent = await renderEmailContent('template', body, templateRecord, templateData);
      
      // Apply overrides if provided
      const finalSubject = overrides?.subject || renderedContent.subject;
      const finalHtml = overrides?.htmlBody || renderedContent.html;
      const finalText = overrides?.textBody || renderedContent.text;

      // Parse email addresses
      const toAddresses = Array.isArray(to) ? to : [to];
      const ccAddresses = Array.isArray(cc) ? cc : (cc ? [cc] : []);
      const bccAddresses = Array.isArray(bcc) ? bcc : (bcc ? [bcc] : []);

      // Start transaction
      await client.query('BEGIN');

      // Log email attempt
      const logResult = await client.query(
        `INSERT INTO email_logs (tenant_id, to_address, subject, status)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenant.id, toAddresses.join(', '), finalSubject, 'sending']
      );

      logId = logResult.rows[0].id;

      // Get nodemailer instance
      const nodemailer = getNodemailer();

      // Create transporter with tenant's SMTP settings
      const transporter = nodemailer.createTransport({
        host: decrypt(tenant.smtp_host),
        port: parseInt(decrypt(tenant.smtp_port)),
        secure: tenant.smtp_secure === 'true',
        auth: {
          user: decrypt(tenant.smtp_user),
          pass: decrypt(tenant.smtp_pass),
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
      });

      // Prepare email options for template mode
      const mailOptions: any = {
        from: from || tenant.from_email,
        to: toAddresses.join(', '),
        cc: ccAddresses.length > 0 ? ccAddresses.join(', ') : undefined,
        bcc: bccAddresses.length > 0 ? bccAddresses.join(', ') : undefined,
        replyTo: replyTo || undefined,
        subject: finalSubject,
        html: finalHtml,
        text: finalText,
      };

      // Log template usage
      logger.info(`Sending template-based email via ${decrypt(tenant.smtp_host)}: ${finalSubject} -> ${toAddresses.join(', ')} (Template: ${templateSlug} v${templateRecord.version})`);

      // Send email with retry logic
      const maxAttempts = parseInt(process.env.RETRY_MAX_ATTEMPTS || '3', 10);
      const baseDelay = parseInt(process.env.RETRY_BASE_DELAY_MS || '500', 10);
      let lastError: any = null;
      let info: any = null;

      const shouldRetry = (err: any) => {
        const transientCodes = ['ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'EAI_AGAIN'];
        if (err && transientCodes.includes(err.code)) return true;
        const rc = err && (err.responseCode || err.code);
        return rc && [421, 450, 451, 452].includes(Number(rc));
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          info = await transporter.sendMail(mailOptions);
          lastError = null;
          break;
        } catch (err: any) {
          lastError = err;
          if (attempt >= maxAttempts || !shouldRetry(err)) break;
          const delay = baseDelay * Math.pow(2, attempt - 1);
          logger.warn(`Send attempt ${attempt} failed, retrying in ${delay}ms: ${err.message || err}`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      if (!info && lastError) throw lastError;

      // Update log as sent
      await client.query(
        'UPDATE email_logs SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['sent', logId]
      );

      // Commit transaction
      await client.query('COMMIT');

      logger.info(`Template email sent successfully: ${info.messageId} for tenant ${tenant.id}`);

      // Fire webhook (non-blocking)
      const webhookUrl = tenant.webhook_url || process.env.TENANT_DEFAULT_WEBHOOK;
      if (webhookUrl) {
        sendWebhook(webhookUrl, {
          event: 'sent',
          tenantId: String(tenant.id),
          emailLogId: Number(logId!),
          to: toAddresses,
          subject: finalSubject,
          template: {
            slug: templateSlug,
            version: templateRecord.version,
            rendered: renderedContent.rendered
          },
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }

      res.json({
        success: true,
        message: 'Email sent successfully',
        messageId: info.messageId,
        template: {
          slug: templateSlug,
          version: templateRecord.version
        }
      });

    } else {
      // Legacy mode (original implementation)
      const { to, from, subject, htmlBody, textBody, cc, bcc, variables, attachments } = body;

      if (!to || !subject || !htmlBody) {
        throw new AppError('Missing required fields: to, subject, htmlBody', 400);
      }

      // Get tenant information from the request (set by auth middleware)
      const tenant = req.tenant;
      if (!tenant) {
        throw new AppError('Tenant not found', 401);
      }

      // Parse email addresses
      const toAddresses = Array.isArray(to) ? to : [to];
      const ccAddresses = Array.isArray(cc) ? cc : (cc ? [cc] : []);
      const bccAddresses = Array.isArray(bcc) ? bcc : (bcc ? [bcc] : []);

      // Start transaction
      await client.query('BEGIN');

      // Log email attempt
      const logResult = await client.query(
        `INSERT INTO email_logs (tenant_id, to_address, subject, status)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [tenant.id, toAddresses.join(', '), subject, 'sending']
      );

      logId = logResult.rows[0].id;

      // Get nodemailer instance
      const nodemailer = getNodemailer();

      // Create transporter with tenant's SMTP settings
      const transporter = nodemailer.createTransport({
        host: decrypt(tenant.smtp_host),
        port: parseInt(decrypt(tenant.smtp_port)),
        secure: tenant.smtp_secure === 'true',
        auth: {
          user: decrypt(tenant.smtp_user),
          pass: decrypt(tenant.smtp_pass),
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
      });

      // Render templates (simple variable substitution)
      const renderedHtml = htmlBody ? renderTemplate(htmlBody, variables) : undefined;
      const renderedText = textBody ? renderTemplate(textBody, variables) : undefined;

      // Prepare email options
      const mailOptions: any = {
        from: from || tenant.from_email,
        to: toAddresses.join(', '),
        cc: ccAddresses.length > 0 ? ccAddresses.join(', ') : undefined,
        bcc: bccAddresses.length > 0 ? bccAddresses.join(', ') : undefined,
        subject,
        html: renderedHtml,
        text: renderedText,
      };

      // Attachments support
      if (Array.isArray(attachments) && attachments.length > 0) {
        mailOptions.attachments = attachments.map((a: any) => ({
          filename: a.filename,
          content: a.content,
          encoding: a.encoding,
          path: a.path,
          contentType: a.contentType,
        }));
      }

      logger.info(`Sending legacy email via ${decrypt(tenant.smtp_host)}: ${subject} -> ${toAddresses.join(', ')}`);

      // Retry logic for transient failures
      const maxAttempts = parseInt(process.env.RETRY_MAX_ATTEMPTS || '3', 10);
      const baseDelay = parseInt(process.env.RETRY_BASE_DELAY_MS || '500', 10);
      let lastError: any = null;
      let info: any = null;

      const shouldRetry = (err: any) => {
        const transientCodes = ['ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'EAI_AGAIN'];
        if (err && transientCodes.includes(err.code)) return true;
        const rc = err && (err.responseCode || err.code);
        return rc && [421, 450, 451, 452].includes(Number(rc));
      };

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          info = await transporter.sendMail(mailOptions);
          lastError = null;
          break;
        } catch (err: any) {
          lastError = err;
          if (attempt >= maxAttempts || !shouldRetry(err)) break;
          const delay = baseDelay * Math.pow(2, attempt - 1);
          logger.warn(`Send attempt ${attempt} failed, retrying in ${delay}ms: ${err.message || err}`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      if (!info && lastError) throw lastError;

      // Update log as sent
      await client.query(
        'UPDATE email_logs SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['sent', logId]
      );

      // Commit transaction
      await client.query('COMMIT');

      logger.info(`Legacy email sent successfully: ${info.messageId} for tenant ${tenant.id}`);

      // Fire webhook (non-blocking)
      const webhookUrl = tenant.webhook_url || process.env.TENANT_DEFAULT_WEBHOOK;
      if (webhookUrl) {
        sendWebhook(webhookUrl, {
          event: 'sent',
          tenantId: String(tenant.id),
          emailLogId: Number(logId!),
          to: toAddresses,
          subject,
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }

      res.json({
        success: true,
        message: 'Email sent successfully',
        messageId: info.messageId
      });
    }

  } catch (error) {
    // Rollback transaction
    await client.query('ROLLBACK');
    
    // Update log with error if we have a logId
    if (logId && typeof error === 'object' && error !== null) {
      try {
        await client.query(
          'UPDATE email_logs SET status = $1, error_message = $2 WHERE id = $3',
          ['failed', (error as any).message || 'Unknown error', logId]
        );
      } catch (updateError) {
        logger.error('Failed to update email log with error:', updateError);
      }
    }
    
    logger.error('Email sending failed:', error);

    // Fire webhook (non-blocking) on failure
    try {
      const tenant = (req as any).tenant;
      const to = req.body?.to;
      const toAddresses = Array.isArray(to) ? to : to ? [to] : [];
      const webhookUrl = tenant?.webhook_url || process.env.TENANT_DEFAULT_WEBHOOK;
      if (webhookUrl && logId) {
        sendWebhook(webhookUrl, {
          event: 'failed',
          tenantId: String(tenant.id),
          emailLogId: Number(logId),
          to: toAddresses,
          subject: req.body?.subject || req.body?.templateSlug || 'Email',
          timestamp: new Date().toISOString(),
          error: (error as any)?.message || 'Unknown error',
        }).catch(() => {});
      }
    } catch (e) { /* noop */ }

    next(error);
  } finally {
    client.release();
  }
};

export const getEmail = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const result = await query(
      'SELECT * FROM email_logs WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      throw new AppError('Email not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    next(error);
  }
};

export const listEmails = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    const tenantId = req.tenantId;

    let whereClause = 'WHERE tenant_id = $1';
    const values: any[] = [tenantId];
    let paramCount = 2;

    if (status) {
      whereClause += ` AND status = $${paramCount++}`;
      values.push(status);
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM email_logs ${whereClause}`,
      values.slice(0, paramCount - 1)
    );
    const total = parseInt(countResult.rows[0].total);

    // Get emails
    values.push((page - 1) * limit, limit);
    const emailsResult = await query(
      `SELECT id, to_address, subject, status, error_message, sent_at, created_at
       FROM email_logs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      values
    );

    res.json({
      success: true,
      data: emailsResult.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });

  } catch (error) {
    next(error);
  }
};
