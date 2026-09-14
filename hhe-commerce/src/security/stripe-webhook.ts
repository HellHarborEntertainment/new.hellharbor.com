import { bytesToHex, hmacSha256, safeEqual } from '../lib/crypto.js';
import { unauthorized } from '../lib/errors.js';

export async function verifyStripeWebhook(payload: string, signatureHeader: string | null, secret: string, toleranceSeconds = 300): Promise<void> {
  if (!signatureHeader) throw unauthorized('Missing Stripe signature');
  const parts = signatureHeader.split(',').map(v => v.trim());
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const signatures = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!timestamp || !signatures.length) throw unauthorized('Invalid Stripe signature header');
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) throw unauthorized('Stale Stripe webhook');
  const expected = bytesToHex(await hmacSha256(`${timestamp}.${payload}`, secret));
  if (!signatures.some(sig => safeEqual(sig, expected))) throw unauthorized('Invalid Stripe signature');
}
