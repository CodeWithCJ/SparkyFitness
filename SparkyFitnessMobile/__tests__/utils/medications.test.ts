import { entryMatchesDose, isDoseLogged, doseSlotStatus } from '../../src/utils/medications';
import type { MedicationEntry, MedicationEntryStatus } from '@workspace/shared';

function buildEntry(overrides: Partial<MedicationEntry> = {}): MedicationEntry {
  return {
    id: 'entry-1',
    user_id: 'user-1',
    medication_id: 'med-1',
    schedule_id: 'sched-1',
    status: 'taken',
    taken_at: '2026-07-28T09:05:00Z',
    scheduled_for: null,
    entry_date: '2026-07-28',
    med_name_snapshot: null,
    dose_amount_snapshot: null,
    dose_unit_snapshot: null,
    notes: null,
    source: 'manual',
    custom_fields: {},
    created_at: '2026-07-28T09:05:00Z',
    updated_at: '2026-07-28T09:05:00Z',
    ...overrides,
  };
}

describe('entryMatchesDose', () => {
  it('matches an entry logged against the same schedule', () => {
    expect(entryMatchesDose(buildEntry(), 'med-1', 'sched-1')).toBe(true);
  });

  it('does not match an entry for a different schedule', () => {
    expect(entryMatchesDose(buildEntry({ schedule_id: 'sched-other' }), 'med-1', 'sched-1')).toBe(
      false,
    );
  });

  it('counts a schedule-less entry for the medication toward any scheduled slot', () => {
    expect(entryMatchesDose(buildEntry({ schedule_id: null }), 'med-1', 'sched-1')).toBe(true);
  });

  it('never counts a PRN log toward a scheduled slot', () => {
    expect(
      entryMatchesDose(buildEntry({ schedule_id: null, status: 'prn_taken' }), 'med-1', 'sched-1'),
    ).toBe(false);
  });

  it('does not count a schedule-less entry of another medication', () => {
    expect(
      entryMatchesDose(buildEntry({ schedule_id: null, medication_id: 'med-other' }), 'med-1', 'sched-1'),
    ).toBe(false);
  });

  it('matches only schedule-less entries of the medication when scheduleId is null', () => {
    expect(entryMatchesDose(buildEntry({ schedule_id: null }), 'med-1', null)).toBe(true);
    expect(entryMatchesDose(buildEntry(), 'med-1', null)).toBe(false);
  });
});

describe('isDoseLogged', () => {
  it.each([['taken'], ['skipped']] as const)('treats a %s entry as logged', (status) => {
    expect(isDoseLogged([buildEntry({ status })], 'med-1', 'sched-1')).toBe(true);
  });

  it.each([['snoozed'], ['prn_taken']] as MedicationEntryStatus[][])(
    'does not treat a %s entry as logged',
    (status) => {
      expect(isDoseLogged([buildEntry({ status })], 'med-1', 'sched-1')).toBe(false);
    },
  );

  it('is false with no matching entries', () => {
    expect(isDoseLogged([buildEntry({ schedule_id: 'sched-other' })], 'med-1', 'sched-1')).toBe(
      false,
    );
  });
});

describe('doseSlotStatus', () => {
  it.each([
    ['taken', 'taken'],
    ['prn_taken', 'taken'],
    ['skipped', 'skipped'],
    ['snoozed', 'pending'],
  ] as [MedicationEntryStatus, string][])('maps a %s entry to %s', (status, expected) => {
    expect(doseSlotStatus(buildEntry({ status }))).toBe(expected);
  });

  it('maps no entry to pending', () => {
    expect(doseSlotStatus(undefined)).toBe('pending');
  });
});
