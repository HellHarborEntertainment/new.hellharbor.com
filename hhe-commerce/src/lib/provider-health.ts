import type { Env, ProviderName } from '../types.js';
export async function providerSuccess(env: Env, provider: ProviderName, operation: string): Promise<void> {
  const now = new Date().toISOString();
  await env.COMMERCE_DB.prepare(`INSERT INTO provider_health (provider, last_operation, last_success_at, consecutive_failures, updated_at) VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(provider) DO UPDATE SET last_operation=excluded.last_operation,last_success_at=excluded.last_success_at,consecutive_failures=0,last_error=NULL,updated_at=excluded.updated_at`)
    .bind(provider, operation, now, now).run();
}
export async function providerFailure(env: Env, provider: ProviderName, operation: string, error: unknown): Promise<void> {
  const now = new Date().toISOString();
  await env.COMMERCE_DB.prepare(`INSERT INTO provider_health (provider, last_operation, last_failure_at, consecutive_failures, last_error, updated_at) VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET last_operation=excluded.last_operation,last_failure_at=excluded.last_failure_at,consecutive_failures=provider_health.consecutive_failures+1,last_error=excluded.last_error,updated_at=excluded.updated_at`)
    .bind(provider, operation, now, String(error).slice(0,2000), now).run();
}
export async function getProviderHealth(env: Env) { const r=await env.COMMERCE_DB.prepare('SELECT * FROM provider_health ORDER BY provider').all(); return r.results||[]; }
