import type { Env } from '../types.js';
import { rateLimited } from '../lib/errors.js';
import { sha256Hex } from '../lib/crypto.js';

export async function enforcePublicRateLimit(env: Env, request: Request, scope: string, identity?: string): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const raw = `${scope}:${identity?.trim().toLowerCase() || 'anonymous'}:${ip}`;
  const { success } = await env.PUBLIC_RATE_LIMITER.limit({ key: await sha256Hex(raw) });
  if (!success) throw rateLimited();
}
export async function enforceAdminRateLimit(env: Env, request: Request, scope: string): Promise<void> {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const { success } = await env.ADMIN_RATE_LIMITER.limit({ key: await sha256Hex(`${scope}:${ip}`) });
  if (!success) throw rateLimited('Admin rate limit exceeded');
}
