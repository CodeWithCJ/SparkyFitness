export const SHARE_COLOR_PRESETS = [
  '#FFFFFF',
  '#111111',
  '#FC4C02',
  '#FF3B30',
  '#FFCC00',
  '#34C759',
  '#0A84FF',
  '#FF2D92',
] as const;

export const DEFAULT_SHARE_COLOR = SHARE_COLOR_PRESETS[0];

/**
 * Turns "#abc", "abc", or "#AABBCC" into "#AABBCC", or null when the text is
 * not a 3 or 6 digit hex color.
 */
export function normalizeHexColor(input: string): string | null {
  const hex = input.trim().replace(/^#/, '');
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  return `#${full.toUpperCase()}`;
}

/**
 * Whether text in this color needs a dark outline and scrim to stay readable
 * (true for light colors). Uses perceived brightness, so yellow counts as
 * light and blue as dark.
 */
export function isLightColor(hex: string): boolean {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return true;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 140;
}
