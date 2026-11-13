import {
  editedTakenAt,
  entryTimeOfDay,
  formatMonthLabel,
  selectPrnMedications,
  shiftMonth,
  weekdayHeaders,
} from '../../src/utils/medicationAdherence';
import { getDueDosesForDate } from '@workspace/shared';
import { buildMedication, buildSchedule } from '../helpers/medicationFixtures';

describe('selectPrnMedications', () => {
  const scheduled = buildMedication({ id: 'scheduled' });
  const unscheduled = buildMedication({ id: 'unscheduled', schedules: [] });
  const prn = buildMedication({
    id: 'prn',
    schedules: [buildSchedule({ id: 'p', schedule_type_id: 'prn' })],
  });
  const inactive = buildMedication({
    id: 'inactive',
    is_active: false,
    schedules: [],
  });
  const medications = [scheduled, unscheduled, prn, inactive];

  it('lists active medications with no schedule or a PRN schedule', () => {
    expect(selectPrnMedications(medications).map((m) => m.id)).toEqual([
      'unscheduled',
      'prn',
    ]);
  });

  it('leaves out a medication that already has a dose slot that day', () => {
    const mixed = buildMedication({
      id: 'mixed',
      schedules: [
        buildSchedule({ id: 'daily' }),
        buildSchedule({ id: 'prn', schedule_type_id: 'prn' }),
      ],
    });
    const due = getDueDosesForDate([mixed], '2026-10-14', 'UTC');
    expect(selectPrnMedications([mixed], []).map((m) => m.id)).toEqual([
      'mixed',
    ]);
    expect(selectPrnMedications([mixed], due)).toEqual([]);
  });
});

describe('shiftMonth', () => {
  it('moves within a year', () => {
    expect(shiftMonth('2026-10', 1)).toBe('2026-11');
    expect(shiftMonth('2026-10', -1)).toBe('2026-09');
  });

  it('rolls over year boundaries in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-03', -15)).toBe('2024-12');
  });
});

describe('formatMonthLabel', () => {
  it('formats the month in the requested locale', () => {
    expect(formatMonthLabel('2026-10', 'en-US')).toBe('October 2026');
    expect(formatMonthLabel('2026-02', 'en-US')).toBe('February 2026');
  });
});

describe('weekdayHeaders', () => {
  it('starts on the first day of the week', () => {
    expect(weekdayHeaders(0, 'en-US')).toEqual([
      'S',
      'M',
      'T',
      'W',
      'T',
      'F',
      'S',
    ]);
    expect(weekdayHeaders(1, 'en-US')[0]).toBe('M');
    expect(weekdayHeaders(1, 'en-US')[6]).toBe('S');
  });
});

describe('entryTimeOfDay / editedTakenAt', () => {
  it('shows the entry time in the given timezone', () => {
    expect(entryTimeOfDay('2026-10-14T08:00:00.000Z', 'UTC')).toBe('08:00');
    expect(entryTimeOfDay('2026-10-14T08:00:00.000Z', 'America/New_York')).toBe(
      '04:00'
    );
  });

  it('builds the instant for an edited time on the entry day', () => {
    expect(editedTakenAt('2026-10-14', '09:30', 'UTC')).toBe(
      '2026-10-14T09:30:00.000Z'
    );
    expect(editedTakenAt('2026-10-14', '09:30', 'America/New_York')).toBe(
      '2026-10-14T13:30:00.000Z'
    );
  });

  it('round-trips an unchanged time', () => {
    const takenAt = '2026-10-14T22:45:00.000Z';
    const tz = 'Europe/Berlin';
    expect(editedTakenAt('2026-10-15', entryTimeOfDay(takenAt, tz), tz)).toBe(
      takenAt
    );
  });

  it('ignores a time component on the entry date', () => {
    expect(editedTakenAt('2026-10-14T00:00:00.000Z', '07:05', 'UTC')).toBe(
      '2026-10-14T07:05:00.000Z'
    );
  });
});
