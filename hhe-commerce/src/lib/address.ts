import type { Address } from '../types.js';
import { badRequest } from './errors.js';

function compact(value: string | undefined): string { return (value || '').trim().replace(/\s+/g, ' '); }
function key(value: string | undefined): string { return compact(value).toLocaleUpperCase('en-US').replace(/[.,#]/g, '').replace(/\s+/g, ' ').trim(); }
function postal(value: string): string { return key(value).replace(/\s/g, ''); }
function bounded(value: string | undefined, field: string, max: number): string {
  const normalized = compact(value);
  if (normalized.length > max) throw badRequest(`${field} is too long`);
  return normalized;
}

export function normalizeAddress(input: Address): Address {
  const address: Address = {
    firstName: bounded(input.firstName, 'First name', 100),
    lastName: bounded(input.lastName, 'Last name', 100),
    company: bounded(input.company, 'Company', 150) || undefined,
    address1: bounded(input.address1, 'Address line 1', 200),
    address2: bounded(input.address2, 'Address line 2', 200) || undefined,
    city: bounded(input.city, 'City', 100),
    state: bounded(input.state, 'State/province', 100) || undefined,
    postalCode: bounded(input.postalCode, 'Postal code', 32),
    country: bounded(input.country, 'Country', 2).toUpperCase()
  };
  if (!address.firstName || !address.lastName || !address.address1 || !address.city || !address.postalCode || !address.country) throw badRequest('Incomplete shipping address');
  if (!/^[A-Z]{2}$/.test(address.country)) throw badRequest('Shipping country must be a two-letter ISO code');
  if (address.country === 'US' || address.country === 'CA') {
    if (!address.state || !/^[A-Za-z]{2}$/.test(address.state)) throw badRequest('US and Canadian shipping addresses require a two-letter state/province code');
    address.state = address.state.toUpperCase();
  }
  if (address.country === 'US' && !/^\d{5}(?:-\d{4})?$/.test(address.postalCode)) throw badRequest('Invalid US postal code');
  if (address.country === 'CA' && !/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/.test(address.postalCode)) throw badRequest('Invalid Canadian postal code');
  return address;
}

export function fulfillmentAddressMatches(quoted: Address, paid: Address): boolean {
  return key(quoted.address1) === key(paid.address1)
    && key(quoted.address2) === key(paid.address2)
    && key(quoted.city) === key(paid.city)
    && key(quoted.state) === key(paid.state)
    && postal(quoted.postalCode) === postal(paid.postalCode)
    && key(quoted.country) === key(paid.country);
}

export function stripeShippingAddress(session: Record<string, any>): Address | null {
  const details = session.collected_information?.shipping_details || session.shipping_details;
  const a = details?.address;
  if (!details || !a) return null;
  const names = String(details.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName = names.shift() || '';
  const lastName = names.join(' ') || firstName;
  return {
    firstName,
    lastName,
    address1: String(a.line1 || ''),
    address2: a.line2 ? String(a.line2) : undefined,
    city: String(a.city || ''),
    state: a.state ? String(a.state) : undefined,
    postalCode: String(a.postal_code || ''),
    country: String(a.country || '').toUpperCase()
  };
}
