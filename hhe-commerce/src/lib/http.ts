import { AppError, payloadTooLarge } from './errors.js';
import type { Env } from '../types.js';

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

export async function readTextLimited(request: Request, maxBytes = 128 * 1024): Promise<string> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge();
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* no-op */ }
      throw payloadTooLarge();
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(joined);
}

export async function readJson<T>(request: Request, maxBytes = 128 * 1024): Promise<T> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new AppError(415, 'unsupported_media_type', 'Expected application/json');
  const raw = await readTextLimited(request, maxBytes);
  try { return JSON.parse(raw) as T; } catch { throw new AppError(400, 'invalid_json', 'Invalid JSON body'); }
}

export function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('origin');
  const allowed = env.ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,idempotency-key,x-hhe-order-token',
    'access-control-max-age': '86400',
    vary: 'Origin'
  };
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) return json({ error: { code: error.code, message: error.message, details: error.details } }, error.status);
  console.error(error);
  return json({ error: { code: 'internal_error', message: 'Internal server error' } }, 500);
}
