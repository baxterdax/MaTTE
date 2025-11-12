import crypto from 'crypto';

export interface WebhookEvent {
  event: 'sent' | 'failed';
  tenantId: string;
  emailLogId: number;
  to: string[];
  subject: string;
  timestamp: string;
  error?: string;
  template?: {
    slug: string;
    version: number;
    rendered?: boolean;
  };
}

export async function sendWebhook(url: string, payload: WebhookEvent) {
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (secret) {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    headers['X-MuTTE-Signature'] = sig;
  }
  try {
    const res = await fetch(url, { method: 'POST', headers, body });
    return res.ok;
  } catch {
    return false;
  }
}
