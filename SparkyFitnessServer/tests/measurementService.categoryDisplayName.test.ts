import { vi, beforeEach, describe, expect, it } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';
import { CustomCategoryExistsError } from '../utils/errors.js';

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
      created: true,
      category: {
        id: 'cat-1',
        name: 'HRV_SDNN',
        display_name: 'HRV (SDNN)',
        frequency: 'Daily',
        measurement_type: 'N/A',
        data_type: 'numeric',
      },
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

  it('uses the stored settings when another sync created the category first', async () => {
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([]);
    vi.mocked(measurementRepository.createCustomCategory).mockResolvedValue({
      id: 'cat-3',
      created: false,
      category: {
        id: 'cat-3',
        name: 'HRV_SDNN',
        display_name: 'HRV (SDNN)',
        frequency: 'Hourly',
        measurement_type: 'N/A',
        data_type: 'numeric',
      },
    });

    const category = await measurementService.getOrCreateCustomCategory(
      userId,
      actingUserId,
      'HRV_SDNN'
    );

    expect(category).toMatchObject({ id: 'cat-3', frequency: 'Hourly' });
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

  it('creates blood_pressure_systolic with default frequency All', async () => {
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([]);
    vi.mocked(measurementRepository.createCustomCategory).mockResolvedValue({
      id: 'cat-bp',
      created: true,
      category: {
        id: 'cat-bp',
        name: 'blood_pressure_systolic',
        display_name: null,
        frequency: 'All',
        measurement_type: 'mmHg',
        data_type: 'numeric',
      },
    });

    const category = await measurementService.getOrCreateCustomCategory(
      userId,
      actingUserId,
      'blood_pressure_systolic',
      'numeric',
      'mmHg'
    );

    expect(measurementRepository.createCustomCategory).toHaveBeenCalledTimes(1);
    const created = vi.mocked(measurementRepository.createCustomCategory).mock
      .calls[0][0];
    expect(created.name).toBe('blood_pressure_systolic');
    expect(created.frequency).toBe('All');
    expect(category.frequency).toBe('All');
  });

  it('upgrades existing blood_pressure_systolic with frequency Daily to All', async () => {
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([
      {
        id: 'cat-bp-existing',
        name: 'blood_pressure_systolic',
        display_name: null,
        frequency: 'Daily',
      },
    ]);
    vi.mocked(measurementRepository.updateCustomCategory).mockResolvedValue({
      id: 'cat-bp-existing',
      name: 'blood_pressure_systolic',
      frequency: 'All',
    });

    const category = await measurementService.getOrCreateCustomCategory(
      userId,
      actingUserId,
      'blood_pressure_systolic'
    );

    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
    expect(measurementRepository.updateCustomCategory).toHaveBeenCalledWith(
      'cat-bp-existing',
      userId,
      actingUserId,
      { frequency: 'All' }
    );
    expect(category.frequency).toBe('All');
  });
});

describe('createCustomCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the new category id', async () => {
    vi.mocked(measurementRepository.createCustomCategory).mockResolvedValue({
      id: 'cat-1',
      created: true,
      category: {
        id: 'cat-1',
        name: 'Waist',
        display_name: null,
        frequency: 'Daily',
        measurement_type: 'cm',
        data_type: 'numeric',
      },
    });

    await expect(
      measurementService.createCustomCategory('user-1', 'user-1', {
        name: 'Waist',
      })
    ).resolves.toEqual({ id: 'cat-1' });
  });

  it('rejects a name the user already has', async () => {
    vi.mocked(measurementRepository.createCustomCategory).mockResolvedValue({
      id: 'cat-1',
      created: false,
      category: {
        id: 'cat-1',
        name: 'Waist',
        display_name: null,
        frequency: 'Daily',
        measurement_type: 'cm',
        data_type: 'numeric',
      },
    });

    await expect(
      measurementService.createCustomCategory('user-1', 'user-1', {
        name: 'Waist',
      })
    ).rejects.toBeInstanceOf(CustomCategoryExistsError);
  });
});
