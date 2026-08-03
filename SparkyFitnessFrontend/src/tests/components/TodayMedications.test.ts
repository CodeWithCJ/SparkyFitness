import { entryMatchesDue } from '@/utils/medicationUtils';
import type { MedicationEntry } from '@/types/medications';

describe('entryMatchesDue', () => {
  const due = {
    medication: { id: 'med-123' },
    schedule: { id: 'sched-456' },
  };

  const createBaseEntry = (
    overrides: Partial<MedicationEntry>
  ): MedicationEntry => ({
    id: 'entry-1',
    medication_id: 'med-123',
    schedule_id: 'sched-456',
    user_id: 'user-1',
    status: 'taken',
    taken_at: '2026-07-28T12:00:00Z',
    scheduled_for: '2026-07-28T12:00:00Z',
    entry_date: '2026-07-28',
    notes: null,
    source: 'web',
    custom_fields: {},
    created_at: '2026-07-28T12:00:00Z',
    updated_at: '2026-07-28T12:00:00Z',
    med_name_snapshot: 'Metformin',
    dose_amount_snapshot: 500,
    dose_unit_snapshot: 'mg',
    entry_type: 'entry',
    ...overrides,
  });

  test('matches when schedule_id matches due schedule id', () => {
    const entry = createBaseEntry({
      schedule_id: 'sched-456',
    });

    expect(entryMatchesDue(entry, due)).toBe(true);
  });

  test('matches schedule-less entries logged via API for the same medication', () => {
    const entry = createBaseEntry({
      schedule_id: null,
      scheduled_for: null,
    });

    expect(entryMatchesDue(entry, due)).toBe(true);
  });

  test('matches injection entries for the same medication', () => {
    const entry = createBaseEntry({
      schedule_id: null,
      entry_type: 'injection',
    });

    expect(entryMatchesDue(entry, due)).toBe(true);
  });

  test('does NOT match PRN entries to scheduled due doses even if schedule_id matches', () => {
    const entry = createBaseEntry({
      schedule_id: 'sched-456',
      status: 'prn_taken',
    });

    expect(entryMatchesDue(entry, due)).toBe(false);
  });

  test('does NOT match PRN entries with null schedule_id to scheduled due doses', () => {
    const entry = createBaseEntry({
      schedule_id: null,
      status: 'prn_taken',
    });

    expect(entryMatchesDue(entry, due)).toBe(false);
  });

  test('does NOT match entries for a different medication', () => {
    const entry = createBaseEntry({
      medication_id: 'med-999',
      schedule_id: null,
    });

    expect(entryMatchesDue(entry, due)).toBe(false);
  });
});
