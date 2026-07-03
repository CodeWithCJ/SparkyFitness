export const getLocalTimeString = (
  utcTimeStr?: string,
  now: Date = new Date()
): string => {
  if (!utcTimeStr) return '02:00';
  const rawParts = utcTimeStr.split(':');
  if (rawParts.length !== 2 || rawParts[0] === '' || rawParts[1] === '')
    return '02:00';
  const h = Number(rawParts[0]);
  const m = Number(rawParts[1]);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59)
    return '02:00';
  const date = new Date(now);
  date.setUTCHours(h, m, 0, 0);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};
