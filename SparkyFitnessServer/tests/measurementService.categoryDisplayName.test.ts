import { vi, beforeEach, describe, expect, it } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';

vi.mock('../models/measurementRepository');

describe('getOrCreateCustomCategory - health display_name', () => {
  const userId = 'user-1';
  const actingUserId = 'user-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new HRV_SDNN category with a friendly display_name', async () => {
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([]);
    vi.mocked(measurementRepository.createCustomCategory).mockResolvedValue({
      id: 'cat-1',
    });

    const category = await measurementService.getOrCreateCustomCategory(
      userId,
      actingUserId,
      'HRV_SDNN'
    );

    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const created = vi.mocked(measurementRepository.createCustomCategory).mock
      .calls[0][0];
    expect(created.name).toBe('HRV_SDNN');
    expect(created.display_name).toBe('HRV (SDNN)');
    expect(category.id).toBe('cat-1');
  });

  it('backfills display_name on an existing HRV category that has none', async () => {
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([
      { id: 'cat-2', name: 'HRV', display_name: null },
    ]);
    vi.mocked(measurementRepository.updateCustomCategory).mockResolvedValue({
      id: 'cat-2',
      name: 'HRV',
      display_name: 'HRV (RMSSD)',
    });

    const category = await measurementService.getOrCreateCustomCategory(
      userId,
      actingUserId,
      'HRV'
    );

    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
    expect(measurementRepository.updateCustomCategory).toHaveBeenCalledWith(
      'cat-2',
      userId,
      actingUserId,
      { display_name: 'HRV (RMSSD)' }
    );
    expect(category.display_name).toBe('HRV (RMSSD)');
  });

  it('does not overwrite an existing display_name', async () => {
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([
      { id: 'cat-3', name: 'HRV', display_name: 'My custom label' },
    ]);

    const category = await measurementService.getOrCreateCustomCategory(
      userId,
      actingUserId,
      'HRV'
    );

    expect(measurementRepository.updateCustomCategory).not.toHaveBeenCalled();
    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
    expect(category.display_name).toBe('My custom label');
  });

  it('leaves categories without a known mapping untouched', async () => {
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([
      { id: 'cat-4', name: 'respiratory_rate', display_name: null },
    ]);

    await measurementService.getOrCreateCustomCategory(
      userId,
      actingUserId,
      'respiratory_rate'
    );

    expect(measurementRepository.updateCustomCategory).not.toHaveBeenCalled();
    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
  });
});
