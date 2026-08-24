import { localizedDescribeSchedules } from '../../src/utils/medicationScheduleLocalization';

const t = ((key: string, options?: { defaultValue?: string; [key: string]: unknown }) => {
  let value = options?.defaultValue ?? key;
  for (const [name, replacement] of Object.entries(options ?? {})) {
    if (name === 'defaultValue') continue;
    value = value.replace(`{{${name}}}`, String(replacement));
  }
  return value;
}) as never;

describe('localizedDescribeSchedules', () => {
  it('groups weekly and specific-days aliases with the same weekdays', () => {
    expect(
      localizedDescribeSchedules(t, [
        { schedule_type_id: 'weekly', days_of_week: [1, 3], time_of_day: '08:00' },
        { schedule_type_id: 'specific_days', days_of_week: [3, 1], time_of_day: '20:00' },
      ]),
    ).toContain('8:00 AM & 8:00 PM');
  });
});
