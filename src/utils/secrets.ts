export type SecretsProvider = 'env' | 'aws-ssm' | 'vault';

let cache = new Map<string, { value?: string; expires: number }>();

function ttl() {
  const ms = parseInt(process.env.SECRETS_CACHE_TTL_MS || '30000', 10);
  return Date.now() + Math.max(ms, 0);
}

export async function getSecret(name: string): Promise<string | undefined> {
  // Simple cache
  const entry = cache.get(name);
  if (entry && entry.expires > Date.now()) return entry.value;

  const provider = (process.env.SECRETS_PROVIDER || 'env') as SecretsProvider;
  let value: string | undefined;

  if (provider === 'env') {
    value = process.env[name];
  } else if (provider === 'aws-ssm') {
    // TODO: Implement AWS SSM adapter (future)
    value = undefined;
  } else if (provider === 'vault') {
    // TODO: Implement Vault adapter (future)
    value = undefined;
  }

  cache.set(name, { value, expires: ttl() });
  return value;
}

export function clearSecretsCache() {
  cache.clear();
}
