import { Request, Response, NextFunction } from 'express';
import { query } from '../db/pool';
import { AppError } from './errorHandler';

export interface AuthRequest extends Request {
  tenantId?: string;
  tenant?: {
    id: string;
    name: string;
    smtp_host: string;
    smtp_port: string;
    smtp_user: string;
    smtp_pass: string;
    smtp_secure: string;
    from_email: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = (req as any).headers['x-api-key'] as string;

    if (!apiKey) {
      throw new AppError('API key is required', 401);
    }

    const result = await query(
      'SELECT id, name, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, from_email, webhook_url FROM tenants WHERE api_key = $1',
      [apiKey]
    );

    if (result.rows.length === 0) {
      throw new AppError('Invalid API key', 401);
    }

    const tenant = result.rows[0];
    req.tenantId = tenant.id;
  req.tenant = tenant;
    next();
  } catch (error) {
    next(error);
  }
};

export const authenticateAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const adminKey = (req as any).headers['x-admin-key'] as string;

    if (!adminKey) {
      throw new AppError('Admin key is required', 401);
    }

    // Use environment variable or default for development
    const adminEnvKey = process.env.ADMIN_API_KEY || 'dev-admin-key';
    
    if (adminKey !== adminEnvKey) {
      throw new AppError('Invalid admin key', 401);
    }

    next();
  } catch (error) {
    next(error);
  }
};
