import {
  medicationsForWatch,
  watchDoseId,
} from '../../src/utils/watchMedications';
import type { MedicationDetail, MedicationEntry } from '@workspace/shared';

const DAY = '2026-07-28';

function buildMedication(
  id: string,
  name: string,
  schedules: { id: string; time_of_day: string | null }[],
  overrides: Record<string, unknown> = {}
): MedicationDetail {
  return {
    id,
    name,
    is_active: true,
    dose_amount: 10,
    dose_unit: 'mg',
    schedules: schedules.map((s) => ({
      id: s.id,
      schedule_type_id: 'daily',
      time_of_day: s.time_of_day,
      active: true,
    })),
    ...overrides,
  } as unknown as MedicationDetail;
}

function buildEntry(overrides: Partial<MedicationEntry> = {}): MedicationEntry {
  return {
    id: 'entry-1',
    user_id: 'user-1',
    medication_id: 'med-1',
    schedule_id: 'sched-1',
    status: 'taken',
    taken_at: '2026-07-28T09:05:00Z',
    scheduled_for: null,
    entry_date: DAY,
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

describe('medicationsForWatch', () => {
  it('lists each scheduled slot with its dose, time and pending status', () => {
    const doses = medicationsForWatch(
      [
        buildMedication('med-1', 'Vitamin D', [
          { id: 'sched-1', time_of_day: '08:00' },
        ]),
      ],
      [],
      DAY,
      'UTC',
      'HH:mm'
    );

    expect(doses).toEqual([
      {
        id: watchDoseId('med-1', 'sched-1'),
        medicationId: 'med-1',
        scheduleId: 'sched-1',
        name: 'Vitamin D',
        detail: '10 mg',
        time: '08:00',
        status: 'pending',
      },
    ]);
  });

  it('reads status from the same entry matching the phone rows use', () => {
    const med = buildMedication('med-1', 'Vitamin D', [
      { id: 'sched-1', time_of_day: '08:00' },
      { id: 'sched-2', time_of_day: '20:00' },
    ]);
    const doses = medicationsForWatch(
      [med],
      [
        buildEntry({ schedule_id: 'sched-1', status: 'taken' }),
        buildEntry({
          id: 'entry-2',
          schedule_id: 'sched-2',
          status: 'skipped',
        }),
      ],
      DAY,
      'UTC',
      'HH:mm'
    );

    expect(doses.map((d) => d.status)).toEqual(['taken', 'skipped']);
  });

  it('leaves untimed slots with an empty time and skips inactive medications', () => {
    const doses = medicationsForWatch(
      [
        buildMedication('med-1', 'Untimed', [
          { id: 'sched-1', time_of_day: null },
        ]),
        buildMedication(
          'med-2',
          'Stopped',
          [{ id: 'sched-2', time_of_day: '09:00' }],
          {
            is_active: false,
          }
        ),
      ],
      [],
      DAY,
      'UTC',
      'HH:mm'
    );

    expect(doses).toHaveLength(1);
    expect(doses[0]).toMatchObject({ name: 'Untimed', time: '' });
  });

  it('returns an empty list when nothing is scheduled', () => {
    expect(medicationsForWatch([], [], DAY, 'UTC', 'HH:mm')).toEqual([]);
  });

  it('lists a medication with no schedule as an as-needed row after the scheduled slots', () => {
    const doses = medicationsForWatch(
      [
        buildMedication('med-new', 'Ibuprofen', []),
        buildMedication('med-1', 'Vitamin D', [
          { id: 'sched-1', time_of_day: '08:00' },
        ]),
      ],
      [],
      DAY,
      'UTC',
      'HH:mm'
    );

    expect(doses.map((d) => d.id)).toEqual([
      watchDoseId('med-1', 'sched-1'),
      watchDoseId('med-new', ''),
    ]);
    expect(doses[1]).toMatchObject({
      medicationId: 'med-new',
      scheduleId: '',
      time: '',
      status: 'pending',
    });
  });

  it('marks an as-needed row taken once a prn_taken entry exists today', () => {
    const doses = medicationsForWatch(
      [buildMedication('med-new', 'Ibuprofen', [])],
      [
        buildEntry({
          medication_id: 'med-new',
          schedule_id: null,
          status: 'prn_taken',
        }),
      ],
      DAY,
      'UTC',
      'HH:mm'
    );

    expect(doses[0].status).toBe('taken');
  });

  it('leaves inactive medications off the watch', () => {
    expect(
      medicationsForWatch(
        [buildMedication('med-new', 'Ibuprofen', [], { is_active: false })],
        [],
        DAY,
        'UTC',
        'HH:mm'
      )
    ).toEqual([]);
  });
});
