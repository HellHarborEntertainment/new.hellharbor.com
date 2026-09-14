export function xmlText(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<\\s*${tag}\\s*>([\\s\\S]*?)<\\s*\\/\\s*${tag}\\s*>`, 'i'));
  return match?.[1]?.trim();
}

export function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<\\s*${tag}\\s*>([\\s\\S]*?)<\\s*\\/\\s*${tag}\\s*>`, 'gi');
  return [...xml.matchAll(re)].map(m => m[1]);
}

export function parseDays(value?: string): { minDays?: number; maxDays?: number } {
  if (!value) return {};
  const nums = [...value.matchAll(/\\d+/g)].map(m => Number(m[0]));
  if (!nums.length) return {};
  return { minDays: nums[0], maxDays: nums[1] ?? nums[0] };
}
