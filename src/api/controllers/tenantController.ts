import { Response, NextFunction } from 'express';
import { query } from '../../db/pool';
import { encrypt, decrypt } from '../../utils/encryption';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';

/**
 * Generate a secure API key for a tenant
 */
function generateApiKey(): string {
  return 'mutte_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Create a new tenant
 */
export const createTenant = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      name,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_pass,
      smtp_secure = 'false',
      from_email
    } = req.body;

    // Validate required fields
    if (!name || !smtp_host || !smtp_port || !smtp_user || !smtp_pass || !from_email) {
      throw new AppError('Missing required fields', 400);
    }

    // Check if tenant name already exists
    const existingTenant = await query('SELECT id FROM tenants WHERE name = $1', [name]);
    if (existingTenant.rows.length > 0) {
      throw new AppError('Tenant with this name already exists', 409);
    }

    // Generate API key
    const api_key = generateApiKey();

    // Encrypt sensitive data
    const encryptedHost = encrypt(smtp_host);
    const encryptedPort = encrypt(smtp_port);
    const encryptedUser = encrypt(smtp_user);
    const encryptedPass = encrypt(smtp_pass);

    // Insert tenant into database
    const result = await query(
      `INSERT INTO tenants (
        name, api_key, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, from_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, api_key, created_at, updated_at`,
      [name, api_key, encryptedHost, encryptedPort, encryptedUser, encryptedPass, smtp_secure, from_email]
    );

    const tenant = result.rows[0];

    logger.info(`New tenant created: ${tenant.id} (${tenant.name})`);

    res.status(201).json({
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        api_key: tenant.api_key,
        created_at: tenant.created_at
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * List all tenants
 */
export const listTenants = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await query(
      'SELECT id, name, api_key, from_email, created_at, updated_at FROM tenants ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Get tenant by ID
 */
export const getTenantById = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT id, name, api_key, smtp_host, smtp_port, smtp_secure, from_email, created_at, updated_at FROM tenants WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Tenant not found', 404);
    }

    const tenant = result.rows[0];

    // Decrypt sensitive data for display
    const decryptedTenant = {
      ...tenant,
      smtp_host: decrypt(tenant.smtp_host),
      smtp_port: decrypt(tenant.smtp_port),
      // Don't expose smtp_user and smtp_pass in the response
      smtp_user: '***',
      smtp_pass: '***'
    };

    res.json({
      success: true,
      data: decryptedTenant
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Update tenant
 */
export const updateTenant = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const {
      name,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_pass,
      smtp_secure,
      from_email
    } = req.body;

    // Check if tenant exists
    const existingTenant = await query('SELECT id FROM tenants WHERE id = $1', [id]);
    if (existingTenant.rows.length === 0) {
      throw new AppError('Tenant not found', 404);
    }

    // Check if name is taken by another tenant
    if (name) {
      const nameCheck = await query('SELECT id FROM tenants WHERE name = $1 AND id != $2', [name, id]);
      if (nameCheck.rows.length > 0) {
        throw new AppError('Tenant with this name already exists', 409);
      }
    }

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (smtp_host) {
      updates.push(`smtp_host = $${paramCount++}`);
      values.push(encrypt(smtp_host));
    }
    if (smtp_port) {
      updates.push(`smtp_port = $${paramCount++}`);
      values.push(encrypt(smtp_port));
    }
    if (smtp_user) {
      updates.push(`smtp_user = $${paramCount++}`);
      values.push(encrypt(smtp_user));
    }
    if (smtp_pass) {
      updates.push(`smtp_pass = $${paramCount++}`);
      values.push(encrypt(smtp_pass));
    }
    if (smtp_secure) {
      updates.push(`smtp_secure = $${paramCount++}`);
      values.push(smtp_secure);
    }
    if (from_email) {
      updates.push(`from_email = $${paramCount++}`);
      values.push(from_email);
    }

    if (updates.length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    // Add updated_at timestamp
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    // Add tenant ID as last parameter
    values.push(id);

    const updateQuery = `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, name, api_key, from_email, updated_at`;

    const result = await query(updateQuery, values);
    const updatedTenant = result.rows[0];

    logger.info(`Tenant updated: ${id}`);

    res.json({
      success: true,
      data: updatedTenant
    });

  } catch (error) {
    next(error);
  }
};

/**
 * Delete tenant
 */
export const deleteTenant = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    // Check if tenant exists
    const existingTenant = await query('SELECT id, name FROM tenants WHERE id = $1', [id]);
    if (existingTenant.rows.length === 0) {
      throw new AppError('Tenant not found', 404);
    }

    // Delete tenant (email_logs will be cascade deleted due to FK constraint)
    await query('DELETE FROM tenants WHERE id = $1', [id]);

    logger.info(`Tenant deleted: ${id} (${existingTenant.rows[0].name})`);

    res.json({
      success: true,
      message: 'Tenant deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};