import type { CSSProperties } from 'react';

/**
 * Recharts tooltip props that stay readable in both themes. Without an explicit
 * text color the value line falls back to black, which disappears on the dark
 * tooltip, and the default hover cursor is a solid light-gray block.
 */
export function sleepChartTooltipProps(isDark: boolean): {
  contentStyle: CSSProperties;
  labelStyle: CSSProperties;
  itemStyle: CSSProperties;
  cursor: { fill: string };
} {
  const text = isDark ? '#f5f5f5' : '#111111';
  return {
    contentStyle: {
      backgroundColor: isDark ? '#1e1e1e' : '#fff',
      border: `1px solid ${isDark ? '#333' : '#ddd'}`,
      borderRadius: '8px',
      fontSize: '12px',
      color: text,
    },
    labelStyle: { color: text },
    itemStyle: { color: text },
    cursor: { fill: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
  };
}
