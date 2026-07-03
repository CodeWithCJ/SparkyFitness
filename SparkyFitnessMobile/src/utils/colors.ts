function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function withAlpha(color: string, alpha: number): string {
  const trimmed = color.trim();
  if (trimmed === 'transparent') return trimmed;

  const hslMatch = trimmed.match(/^hsl\((.+)\)$/);
  if (hslMatch) return `hsla(${hslMatch[1]}, ${alpha})`;

  const hslaMatch = trimmed.match(/^hsla\((.+),\s*[\d.]+\)$/);
  if (hslaMatch) return `hsla(${hslaMatch[1]}, ${alpha})`;

  const shortHexMatch = trimmed.match(/^#([0-9a-f]{3})$/i);
  if (shortHexMatch) {
    return hexToRgba(
      shortHexMatch[1]
        .split('')
        .map(value => value + value)
        .join(''),
      alpha,
    );
  }

  const hexMatch = trimmed.match(/^#([0-9a-f]{6})$/i);
  if (!hexMatch) return trimmed;

  return hexToRgba(hexMatch[1], alpha);
}
