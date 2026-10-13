export interface ReaderAppearance {
  family: 'serif' | 'sans';
  size: number;
  lineHeight: number;
  sentencePerLine: boolean;
  hintSeen: boolean;
}

export const defaultAppearance: ReaderAppearance = {
  family: 'serif',
  size: 1.35,
  lineHeight: 1.9,
  sentencePerLine: false,
  hintSeen: false,
};

export function validAppearance(value: unknown): value is ReaderAppearance {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    Object.keys(item).length === 5 &&
    ['serif', 'sans'].includes(String(item.family)) &&
    typeof item.size === 'number' &&
    Number.isFinite(item.size) &&
    item.size >= 1 &&
    item.size <= 2 &&
    typeof item.lineHeight === 'number' &&
    Number.isFinite(item.lineHeight) &&
    item.lineHeight >= 1.4 &&
    item.lineHeight <= 2.4 &&
    typeof item.sentencePerLine === 'boolean' &&
    typeof item.hintSeen === 'boolean'
  );
}
