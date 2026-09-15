function decodeXmlText(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, entity => {
    const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    const lower = entity.toLowerCase();
    if (named[lower]) return named[lower];
    const numeric = lower.startsWith('&#x') ? Number.parseInt(lower.slice(3, -1), 16) : Number.parseInt(lower.slice(2, -1), 10);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : entity;
  });
}

export function xmlText(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<\\s*${tag}\\s*>([\\s\\S]*?)<\\s*\\/\\s*${tag}\\s*>`, 'i'));
  return match?.[1] === undefined ? undefined : decodeXmlText(match[1].trim());
}

export function xmlBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<\\s*${tag}\\s*>([\\s\\S]*?)<\\s*\\/\\s*${tag}\\s*>`, 'gi');
  return [...xml.matchAll(re)].map(match => match[1]);
}

export function parseDays(value?: string): { minDays?: number; maxDays?: number } {
  if (!value) return {};
  const nums = [...value.matchAll(/\d+/g)].map(match => Number(match[0]));
  if (!nums.length) return {};
  return { minDays: nums[0], maxDays: nums[1] ?? nums[0] };
}
