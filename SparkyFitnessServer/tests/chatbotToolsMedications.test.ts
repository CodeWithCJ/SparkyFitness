import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildMedicationTools } from '../ai/tools/medicationTools.js';
import medicationRepository from '../models/medicationRepository.js';

vi.mock('../models/medicationRepository', () => ({
  default: {
    listMedications: vi.fn(),
    getMedicationById: vi.fn(),
    createMedication: vi.fn(),
    updateMedication: vi.fn(),
    deleteMedication: vi.fn(),
    addSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
  },
}));
vi.mock('../models/medicationEntryRepository', () => ({
  default: {
    createEntry: vi.fn(),
    listEntriesWithInjections: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
  },
}));
vi.mock('../models/injectionRepository', () => ({
  default: {
    createInjection: vi.fn(),
    listInjections: vi.fn(),
  },
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

const opts = { toolCallId: 'tc-1', messages: [] };
const MED_ID = '123e4567-e89b-12d3-a456-426614174000';
const SCHEDULE_ID = '223e4567-e89b-12d3-a456-426614174000';
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

let tools: ReturnType<typeof buildMedicationTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildMedicationTools('user-1', 'UTC');
});

describe('sparky_manage_medications create/update/delete + schedules', () => {
  it('create_medication confirms with label and id', async () => {
    vi.mocked(medicationRepository.createMedication).mockResolvedValue({
      id: MED_ID,
      display_name: null,
      name: 'Sertraline',
      strength_value: 50,
      strength_unit: 'mg',
      is_active: true,
    });

    const result = await tools.sparky_manage_medications.execute!(
      {
        action: 'create_medication',
        name: 'Sertraline',
        strength_value: 50,
        strength_unit: 'mg',
      },
      opts
    );

    expect(result).toBe(
      `✅ Medication **Sertraline** — 50mg created (ID: ${MED_ID}).`
    );
    expect(medicationRepository.createMedication).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ name: 'Sertraline', strength_value: 50 })
    );
  });

  it('create_medication is inferred from name without an action', async () => {
    vi.mocked(medicationRepository.createMedication).mockResolvedValue({
      id: MED_ID,
      display_name: null,
      name: 'Omega',
      strength_value: null,
      strength_unit: null,
      is_active: true,
    });

    const result = await tools.sparky_manage_medications.execute!(
      { name: 'Omega' },
      opts
    );

    expect(result).toBe(`✅ Medication **Omega** created (ID: ${MED_ID}).`);
  });

  it('create_medication rejects a missing name', async () => {
    const result = await tools.sparky_manage_medications.execute!(
      { action: 'create_medication' },
      opts
    );

    expect(result).toContain('Error [VALIDATION]');
    expect(medicationRepository.createMedication).not.toHaveBeenCalled();
  });

  it('update_medication confirms the updated label', async () => {
    vi.mocked(medicationRepository.updateMedication).mockResolvedValue({
      id: MED_ID,
      display_name: null,
      name: 'Bupropion XL',
      strength_value: 300,
      strength_unit: 'mg',
      is_active: true,
    });

    const result = await tools.sparky_manage_medications.execute!(
      {
        action: 'update_medication',
        medication_id: MED_ID,
        strength_value: 300,
      },
      opts
    );

    expect(result).toBe('✅ Medication **Bupropion XL** — 300mg updated.');
  });

  it('update_medication passes null through to clear a field', async () => {
    vi.mocked(medicationRepository.updateMedication).mockResolvedValue({
      id: MED_ID,
      display_name: null,
      name: 'Bupropion XL',
      strength_value: 300,
      strength_unit: 'mg',
      is_active: true,
    });

    await tools.sparky_manage_medications.execute!(
      {
        action: 'update_medication',
        medication_id: MED_ID,
        reason_text: null,
      },
      opts
    );

    expect(medicationRepository.updateMedication).toHaveBeenCalledWith(
      'user-1',
      MED_ID,
      expect.objectContaining({ reason_text: null })
    );
  });

  it('update_medication returns NOT_FOUND when the med is missing', async () => {
    vi.mocked(medicationRepository.updateMedication).mockResolvedValue(null);

    const result = await tools.sparky_manage_medications.execute!(
      { action: 'update_medication', medication_id: MED_ID, is_active: false },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Medication with ID '${MED_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('delete_medication confirms deletion', async () => {
    vi.mocked(medicationRepository.deleteMedication).mockResolvedValue(true);

    const result = await tools.sparky_manage_medications.execute!(
      { action: 'delete_medication', medication_id: MED_ID },
      opts
    );

    expect(result).toBe('✅ Medication deleted.');
  });

  it('delete_medication returns NOT_FOUND when nothing was deleted', async () => {
    vi.mocked(medicationRepository.deleteMedication).mockResolvedValue(false);

    const result = await tools.sparky_manage_medications.execute!(
      { action: 'delete_medication', medication_id: MED_ID },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Medication with ID '${MED_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('add_schedule confirms with type, time, and id', async () => {
    vi.mocked(medicationRepository.addSchedule).mockResolvedValue({
      id: SCHEDULE_ID,
      schedule_type_id: 'daily',
      time_of_day: '13:00',
      dose_amount: null,
      active: true,
      prn_reason: null,
    });

    const result = await tools.sparky_manage_medications.execute!(
      { action: 'add_schedule', medication_id: MED_ID, time_of_day: '13:00' },
      opts
    );

    expect(result).toBe(
      `✅ Schedule added (daily at 13:00, ID: ${SCHEDULE_ID}).`
    );
    expect(medicationRepository.addSchedule).toHaveBeenCalledWith(
      'user-1',
      MED_ID,
      expect.objectContaining({
        schedule_type_id: 'daily',
        time_of_day: '13:00',
      })
    );
  });

  it('add_schedule is inferred from time_of_day and defaults type to daily', async () => {
    vi.mocked(medicationRepository.addSchedule).mockResolvedValue({
      id: SCHEDULE_ID,
      schedule_type_id: 'daily',
      time_of_day: '18:00',
      dose_amount: null,
      active: true,
      prn_reason: null,
    });

    const result = await tools.sparky_manage_medications.execute!(
      { medication_id: MED_ID, time_of_day: '18:00' },
      opts
    );

    expect(result).toBe(
      `✅ Schedule added (daily at 18:00, ID: ${SCHEDULE_ID}).`
    );
  });

  it('list_schedules renders each schedule for the medication', async () => {
    vi.mocked(medicationRepository.getMedicationById).mockResolvedValue({
      id: MED_ID,
      display_name: null,
      name: 'Sertraline',
      strength_value: 50,
      strength_unit: 'mg',
      is_active: true,
      dose_amount: null,
      dose_unit: null,
      is_glp1: false,
      reason_text: null,
      notes: null,
      schedules: [
        {
          id: SCHEDULE_ID,
          schedule_type_id: 'daily',
          time_of_day: '13:00',
          dose_amount: null,
          active: true,
          prn_reason: null,
        },
      ] as unknown as MedicationDetailScheduleShape,
    });

    const result = await tools.sparky_manage_medications.execute!(
      { action: 'list_schedules', medication_id: MED_ID },
      opts
    );

    expect(result).toBe(
      '# Schedules for Sertraline\n\n' +
        `**13:00** (daily)\n  ID: ${SCHEDULE_ID}`
    );
  });

  it('list_schedules returns NOT_FOUND when the med is missing', async () => {
    vi.mocked(medicationRepository.getMedicationById).mockResolvedValue(null);

    const result = await tools.sparky_manage_medications.execute!(
      { action: 'list_schedules', medication_id: MED_ID },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Medication with ID '${MED_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('delete_schedule confirms deletion', async () => {
    vi.mocked(medicationRepository.deleteSchedule).mockResolvedValue(true);

    const result = await tools.sparky_manage_medications.execute!(
      { action: 'delete_schedule', schedule_id: SCHEDULE_ID },
      opts
    );

    expect(result).toBe('✅ Schedule deleted.');
  });

  it('delete_schedule is inferred from schedule_id', async () => {
    vi.mocked(medicationRepository.deleteSchedule).mockResolvedValue(true);

    const result = await tools.sparky_manage_medications.execute!(
      { schedule_id: SCHEDULE_ID },
      opts
    );

    expect(result).toBe('✅ Schedule deleted.');
  });

  it('delete_schedule returns NOT_FOUND when nothing was deleted', async () => {
    vi.mocked(medicationRepository.deleteSchedule).mockResolvedValue(false);

    const result = await tools.sparky_manage_medications.execute!(
      { action: 'delete_schedule', schedule_id: SCHEDULE_ID },
      opts
    );

    expect(result).toBe(
      `Error [NOT_FOUND]: Schedule with ID '${SCHEDULE_ID}' not found.\n\nSuggestion: Check the ID and try again.`
    );
  });

  it('returns DB_ERROR when the repository throws', async () => {
    vi.mocked(medicationRepository.createMedication).mockRejectedValue(
      new Error('boom')
    );

    const result = await tools.sparky_manage_medications.execute!(
      { action: 'create_medication', name: 'Sertraline' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});

type MedicationDetailScheduleShape = {
  time_of_day: string | null;
  active: boolean | null;
  dose_amount: number | null;
  prn_reason: string | null;
}[];
