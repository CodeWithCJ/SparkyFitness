import { vi, beforeEach, describe, expect, it } from 'vitest';
import axios from 'axios';
import freeExerciseDBService from '../integrations/freeexercisedb/FreeExerciseDBService.js';

vi.mock('axios');

describe('FreeExerciseDBService search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches split-term queries and prioritizes exact match sequence sorting', async () => {
    const mockExercises = [
      { name: 'Barbell Lunge' },
      { name: 'Lunge (Barbell)' },
      { name: 'Dumbbell Lunge' },
      { name: 'Barbell Walking Lunge' },
    ];

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockExercises });

    // Search for "lunge barbe" which should split to "lunge" and "barbe" and match case insensitively.
    // Since "Barbe" matches "Barbell", we expect matches.
    // None match the exact sequence "lunge barbe", so they sort alphabetically.
    const result = (await freeExerciseDBService.searchExercises(
      'lunge barbe'
    )) as any;

    expect(result.totalCount).toBe(3); // Barbell Lunge, Lunge (Barbell), Barbell Walking Lunge
    expect(result.exercises.map((e: any) => e.name)).toEqual([
      'Barbell Lunge',
      'Barbell Walking Lunge',
      'Lunge (Barbell)',
    ]);
  });

  it('prioritizes exact matches', async () => {
    const mockExercises = [
      { name: 'Lunge (Barbell)' },
      { name: 'Barbell Lunge' },
      { name: 'Barbell Walking Lunge' },
    ];

    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockExercises });

    // Search for "barbell lunge"
    // "Barbell Lunge" contains the exact sequence "barbell lunge", so it should rank first.
    const result = (await freeExerciseDBService.searchExercises(
      'barbell lunge'
    )) as any;

    expect(result.exercises.map((e: any) => e.name)).toEqual([
      'Barbell Lunge', // Priority 0
      'Barbell Walking Lunge', // Priority 1 (alphabetical)
      'Lunge (Barbell)', // Priority 1 (alphabetical)
    ]);
  });
});
