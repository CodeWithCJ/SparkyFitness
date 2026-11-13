import type {
  MedicationDetail,
  MedicationEntry,
  MedicationSchedule,
} from '@workspace/shared';

export function buildSchedule(
  overrides: Partial<MedicationSchedule> = {}
): MedicationSchedule {
  return {
    id: 'sched-1',
    medication_id: 'med-1',
    schedule_type_id: 'daily',
    time_of_day: '08:00',
    dose_amount: null,
    days_of_week: null,
    interval_days: null,
    day_of_month: null,
    cycle_on_days: null,
    cycle_off_days: null,
    prn_reason: null,
    prn_max_per_day: null,
    with_meal: null,
    start_date: '2026-01-01',
    end_date: null,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function buildMedication(
  overrides: Partial<MedicationDetail> = {}
): MedicationDetail {
  return {
    id: 'med-1',
    user_id: 'user-1',
    name: 'Lisinopril',
    display_name: null,
    type_id: 'pill',
    route_id: null,
    strength_value: null,
    strength_unit: null,
    dose_amount: 1,
    dose_unit: 'tablet',
    reason_text: null,
    effectiveness_rating: null,
    color: null,
    icon: null,
    photo_path: null,
    is_active: true,
    is_quick: false,
    is_glp1: false,
    notes: null,
    source: 'manual',
    custom_fields: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schedules: [buildSchedule()],
    ...overrides,
  };
}

export function buildEntry(
  overrides: Partial<MedicationEntry> = {}
): MedicationEntry {
  return {
    id: 'entry-1',
    medication_id: 'med-1',
    schedule_id: 'sched-1',
    user_id: 'user-1',
    status: 'taken',
    taken_at: '2026-10-14T08:00:00.000Z',
    scheduled_for: null,
    entry_date: '2026-10-14',
    med_name_snapshot: 'Lisinopril',
    dose_amount_snapshot: null,
    dose_unit_snapshot: null,
    notes: null,
    source: 'mobile',
    custom_fields: {},
    created_at: '2026-10-14T08:00:00.000Z',
    updated_at: '2026-10-14T08:00:00.000Z',
    entry_type: 'entry',
    ...overrides,
  };
}
