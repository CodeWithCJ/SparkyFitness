import { vi, beforeEach, describe, expect, it } from 'vitest';
import workoutPresetService from '../services/workoutPresetService.js';
import workoutPresetRepository from '../models/workoutPresetRepository.js';

vi.mock('../models/workoutPresetRepository', () => ({
  default: {
    createWorkoutPreset: vi.fn(),
  },
}));
vi.mock('../models/exerciseRepository', () => ({
  default: {
    getExerciseById: vi.fn(),
  },
}));
vi.mock('../models/preferenceRepository', () => ({
  default: {},
}));
vi.mock('../utils/uuidUtils', () => ({
  resolveExerciseIdToUuid: vi.fn(async (id: string) => id),
}));

const USER_ID = '99999999-9999-4999-8999-999999999999';

describe('workoutPresetService.createWorkoutPreset ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workoutPresetRepository.createWorkoutPreset).mockResolvedValue({
      id: 7,
    });
  });

  it('injects the authenticated user id into the repository payload', async () => {
    await workoutPresetService.createWorkoutPreset(USER_ID, {
      name: 'Push Day',
      exercises: [],
    });

    const [payload] = vi.mocked(workoutPresetRepository.createWorkoutPreset)
      .mock.calls[0];
    expect(payload.user_id).toBe(USER_ID);
  });

  it('overrides any user_id smuggled past the schema into the service', async () => {
    await workoutPresetService.createWorkoutPreset(USER_ID, {
      user_id: '00000000-0000-4000-8000-000000000000',
      name: 'Push Day',
      exercises: [],
    });

    const [payload] = vi.mocked(workoutPresetRepository.createWorkoutPreset)
      .mock.calls[0];
    expect(payload.user_id).toBe(USER_ID);
  });
});
