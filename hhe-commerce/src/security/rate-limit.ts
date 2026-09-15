import type { Env } from '../types.js';
import { rateLimited } from '../lib/errors.js';
import { sha256Hex } from '../lib/crypto.js';

async function limit(binding: RateLimit, rawKey: string): Promise<boolean> {
  const { success } = await binding.limit({ key: await sha256Hex(rawKey) });
  return success;
}

export async function enforcePublicRateLimit(env: Env, request: Request, scope: string, identity?: string): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await limit(env.PUBLIC_RATE_LIMITER, `${scope}:ip:${ip}`))) throw rateLimited();
  const normalizedIdentity = identity?.trim().toLowerCase();
  if (normalizedIdentity && !(await limit(env.PUBLIC_RATE_LIMITER, `${scope}:identity:${normalizedIdentity}`))) throw rateLimited();
}

export async function enforceAdminRateLimit(env: Env, request: Request, scope: string): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!(await limit(env.ADMIN_RATE_LIMITER, `${scope}:ip:${ip}`))) throw rateLimited('Admin rate limit exceeded');
}
