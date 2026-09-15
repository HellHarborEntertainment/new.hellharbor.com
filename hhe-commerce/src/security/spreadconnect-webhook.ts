import { bytesToBase64, hmacSha256, safeEqual } from '../lib/crypto.js';
import { unauthorized } from '../lib/errors.js';

export async function verifySpreadconnectWebhook(payload: string, signature: string | null, secret?: string): Promise<void> {
  if (!secret) throw unauthorized('Spreadconnect webhook secret is not configured');
  if (!signature) throw unauthorized('Missing Spreadconnect signature');
  const expected = bytesToBase64(await hmacSha256(payload, secret));
  if (!safeEqual(signature.trim(), expected)) throw unauthorized('Invalid Spreadconnect signature');
}
