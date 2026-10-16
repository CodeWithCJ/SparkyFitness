/** Domain colour tokens from `@workspace/shared` moods, as hex for chips. */
const MOOD_COLOR: Record<string, string> = {
  sky: '#7FB6CE',
  green: '#A8C8A0',
  amber: '#E8B54A',
  period: '#E4796B',
  lavender: '#B49BD8',
  neutral: '#B8ABA3',
};

export const moodColorHex = (token?: string | null): string =>
  (token && MOOD_COLOR[token]) || MOOD_COLOR.neutral;
