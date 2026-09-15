import type { HheShippingOption, ShippingPolicy } from '../types.js';
export function applyShippingPolicy(options: HheShippingOption[], subtotal: number, policy: ShippingPolicy): HheShippingOption[] {
  return options.map(option => {
    const marked = Math.round(option.actualProviderCost * (10000 + policy.shippingMarkupBps) / 10000);
    let price = Math.max(policy.minShippingChargeCents, marked - policy.shippingSubsidyCents);
    if (option.id === 'economy' && policy.freeShippingThresholdCents > 0 && subtotal >= policy.freeShippingThresholdCents) price = 0;
    return { ...option, price };
  });
}
