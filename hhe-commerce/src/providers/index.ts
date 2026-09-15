import type { FulfillmentProvider } from './types.js';
import type { ProviderName } from '../types.js';
import { kunakiProvider } from './kunaki.js';
import { spreadconnectProvider } from './spreadconnect.js';
import { badRequest } from '../lib/errors.js';

export function getProvider(name: ProviderName): FulfillmentProvider {
  if (name === 'kunaki') return kunakiProvider;
  if (name === 'spreadconnect') return spreadconnectProvider;
  throw badRequest(`Unsupported fulfillment provider: ${name}`);
}
