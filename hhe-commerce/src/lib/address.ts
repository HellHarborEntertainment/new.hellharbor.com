import type { Address } from '../types.js';
import { badRequest } from './errors.js';

function compact(value: string | undefined): string { return (value || '').trim().replace(/\s+/g, ' '); }
function key(value: string | undefined): string { return compact(value).toLocaleUpperCase('en-US').replace(/[.,#]/g, '').replace(/\s+/g, ' ').trim(); }
function postal(value: string): string { return key(value).replace(/\s/g, ''); }

export function normalizeAddress(input: Address): Address {
  const address: Address = {
    firstName: compact(input.firstName), lastName: compact(input.lastName), company: compact(input.company) || undefined,
    address1: compact(input.address1), address2: compact(input.address2) || undefined, city: compact(input.city),
    state: compact(input.state) || undefined, postalCode: compact(input.postalCode), country: compact(input.country).toUpperCase()
  };
  if (!address.firstName || !address.lastName || !address.address1 || !address.city || !address.postalCode || !address.country) throw badRequest('Incomplete shipping address');
  if (!/^[A-Z]{2}$/.test(address.country)) throw badRequest('Shipping country must be a two-letter ISO code');
  return address;
}

export function fulfillmentAddressMatches(quoted: Address, paid: Address): boolean {
  const a = normalizeAddress(quoted); const b = normalizeAddress(paid);
  return key(a.address1) === key(b.address1) && key(a.address2) === key(b.address2) && key(a.city) === key(b.city)
    && key(a.state) === key(b.state) && postal(a.postalCode) === postal(b.postalCode) && key(a.country) === key(b.country);
}

export function stripeShippingAddress(session: Record<string, any>): Address | null {
  const details = session.collected_information?.shipping_details || session.shipping_details;
  const a = details?.address;
  if (!details || !a) return null;
  const names = String(details.name || '').trim().split(/\s+/);
  return {
    firstName: names.shift() || '', lastName: names.join(' ') || '', address1: String(a.line1 || ''), address2: a.line2 ? String(a.line2) : undefined,
    city: String(a.city || ''), state: a.state ? String(a.state) : undefined, postalCode: String(a.postal_code || ''), country: String(a.country || '').toUpperCase()
  };
}
