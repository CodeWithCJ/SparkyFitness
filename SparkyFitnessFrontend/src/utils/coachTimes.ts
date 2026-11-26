/** Check-ins are on the quarter hour: round what the picker gives. */
export function roundToQuarterHour(time: string): string {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  const total = Math.min(
    23 * 60 + 45,
    Math.round((hour * 60 + minute) / 15) * 15
  );
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
