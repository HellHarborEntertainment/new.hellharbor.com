import type { Env } from '../types.js';
import { forbidden, upstream } from '../lib/errors.js';
import { randomId } from '../lib/crypto.js';

interface TurnstileResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

function required(env: Env): boolean {
  return String(env.REQUIRE_TURNSTILE || '').trim().toLowerCase() === 'true';
}

export async function verifyTurnstile(env: Env, request: Request, expectedAction: string): Promise<void> {
  if (!required(env)) return;
  if (!env.TURNSTILE_SECRET_KEY) throw upstream('Turnstile is required but not configured');

  const token = (request.headers.get('x-turnstile-token') || '').trim();
  if (!token || token.length > 2048) throw forbidden('Human verification is required');

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
    idempotency_key: crypto.randomUUID()
  });
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) body.set('remoteip', ip);

  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });
  } catch (error) {
    throw upstream('Human verification service is temporarily unavailable', { requestId: randomId('turnstile') });
  }

  let result: TurnstileResponse;
  try { result = await response.json() as TurnstileResponse; }
  catch { throw upstream('Human verification returned an invalid response'); }
  if (!response.ok) throw upstream('Human verification service rejected the validation request');
  if (!result.success) throw forbidden('Human verification failed');

  const allowedHostnames = (env.TURNSTILE_EXPECTED_HOSTNAMES || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (allowedHostnames.length && (!result.hostname || !allowedHostnames.includes(result.hostname.toLowerCase()))) throw forbidden('Human verification hostname mismatch');
  if (result.action && result.action !== expectedAction) throw forbidden('Human verification action mismatch');
}
