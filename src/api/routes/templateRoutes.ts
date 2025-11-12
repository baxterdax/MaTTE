import { Router } from 'express';
import { authenticate, authenticateAdmin } from '../../middleware/auth';
import rateLimit from 'express-rate-limit';
import {
  createTemplate,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  listTemplates,
  previewTemplate
} from '../controllers/templateController';

const router = Router();

// Rate limiting for admin endpoints (disabled in test mode)
const adminRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' ? 1000 : 10,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => process.env.NODE_ENV === 'test', // Skip rate limiting in test mode
});

// Apply admin authentication to all template routes
router.use(authenticateAdmin);
router.use(adminRateLimit);

// Create a new template
router.post('/admin/templates', createTemplate);

// Get a specific template
router.get('/admin/templates/:tenantId/:slug', getTemplate);

// List templates for a tenant
router.get('/admin/templates/:tenantId', listTemplates);

// Update a template
router.put('/admin/templates/:id', updateTemplate);

// Delete a template (soft delete)
router.delete('/admin/templates/:id', deleteTemplate);

// Preview a template
router.post('/admin/preview', previewTemplate);

export default router;
