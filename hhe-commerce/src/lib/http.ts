import { AppError } from './errors.js';
import type { Env } from '../types.js';

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new AppError(415, 'unsupported_media_type', 'Expected application/json');
  try { return await request.json() as T; } catch { throw new AppError(400, 'invalid_json', 'Invalid JSON body'); }
}
export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map(v => v.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,idempotency-key',
    'access-control-max-age': '86400', vary: 'Origin'
  };
}
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) return json({ error: { code: error.code, message: error.message, details: error.details } }, error.status);
  console.error(error); return json({ error: { code: 'internal_error', message: 'Internal server error' } }, 500);
}
