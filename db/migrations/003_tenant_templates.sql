-- Migration: Per-Tenant Email Templates Support

CREATE TABLE IF NOT EXISTS tenant_templates (
  id bigserial PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,  -- Human-readable name, e.g., "Contact Form"
  slug text NOT NULL,  -- Unique identifier for API, e.g., "contact-form-v1"
  engine text NOT NULL DEFAULT 'handlebars',  -- 'handlebars' or 'mjml'
  content text NOT NULL,  -- Main template body (Handlebars/MJML markup)
  subject_template text NOT NULL,  -- Handlebars template for subject line
  plaintext_template text,  -- Optional Handlebars for custom plain text
  version int NOT NULL DEFAULT 1,  -- Increment for updates
  is_active boolean NOT NULL DEFAULT true,  -- For staging/production toggle
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, slug, version)
);

CREATE INDEX IF NOT EXISTS idx_tenant_templates_tenant_slug ON tenant_templates(tenant_id, slug);
CREATE INDEX IF NOT EXISTS idx_tenant_templates_active ON tenant_templates(tenant_id, is_active);
