import {
  createFoodVariant,
  saveFood,
  type FoodCreateProgress,
} from '@/api/Foods/enhancedCustomFoodFormService';
import { apiCall } from '@/api/api';
import type { Food, FoodVariant } from '@/types/food';

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
}));

const mockApiCall = jest.mocked(apiCall);

const createVariant = (overrides: Partial<FoodVariant> = {}): FoodVariant => ({
  serving_size: 1,
  serving_unit: 'piece',
  serving_description: '1 piece (200 g)',
  calories: 50,
  protein: 1,
  carbs: 10,
  fat: 1,
  ...overrides,
});

const createFood = (overrides: Partial<Food> = {}): Food => ({
  id: '',
  name: 'Yazio Apple',
  brand: 'Yazio',
  is_custom: true,
  barcode: '1234567890123',
  provider_type: 'yazio',
  provider_external_id: 'yazio-apple-1',
  provider_verified: true,
  ...overrides,
});

describe('enhancedCustomFoodFormService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiCall.mockReset();
  });

  it.each([1, 2])(
    'rebases only the selected saved row when another row shares its unit at size %s',
    async (customSize) => {
      const reference = createVariant({
        id: 'reference',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        is_default: true,
      });
      const calculated = createVariant({
        id: 'calculated-packet',
        serving_unit: 'packet (150 g)',
        calories: 150,
      });
      const custom = createVariant({
        id: 'custom-packet',
        serving_size: customSize,
        serving_unit: 'packet (150 g)',
        calories: 777,
      });
      const saved = createFood({
        id: 'saved-food',
        default_variant: reference,
      });
      mockApiCall.mockImplementation(async (url) =>
        url.includes('food-variants?') ? [reference, calculated, custom] : saved
      );

      await saveFood(
        saved,
        [{ ...reference, calories: 100 }, calculated, custom],
        'user-1',
        saved.id,
        undefined,
        undefined,
        {
          createProgress: {
            savedFood: saved,
            baselineVariantIds: ['reference'],
          },
          managedPortions: [{ id: 'calculated-packet' }],
        }
      );

      expect(mockApiCall).toHaveBeenCalledWith(
        '/foods/food-variants/calculated-packet',
        expect.objectContaining({
          body: expect.objectContaining({ calories: 300 }),
        })
      );
      expect(mockApiCall).toHaveBeenCalledWith(
        '/foods/food-variants/custom-packet',
        expect.objectContaining({
          body: expect.objectContaining({ calories: 777 }),
        })
      );
    }
  );

  it.each([1, 2])(
    'rebases only the selected draft row when another draft shares its unit at size %s',
    async (customSize) => {
      const reference = createVariant({
        id: 'reference',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        is_default: true,
      });
      const saved = createFood({
        id: 'saved-food',
        default_variant: reference,
      });
      mockApiCall.mockImplementation(async (url) =>
        url.includes('food-variants?') ? [reference] : saved
      );

      await saveFood(
        createFood(),
        [
          { ...reference, calories: 100 },
          createVariant({ serving_unit: 'packet (150 g)', calories: 150 }),
          createVariant({
            serving_size: customSize,
            serving_unit: 'packet (150 g)',
            calories: 777,
          }),
        ],
        'user-1',
        undefined,
        undefined,
        undefined,
        { managedPortions: [{ draftIndex: 1 }] }
      );

      expect(mockApiCall).toHaveBeenCalledWith(
        '/foods/food-variants/bulk',
        expect.objectContaining({
          body: [
            expect.objectContaining({ calories: 300 }),
            expect.objectContaining({
              serving_size: customSize,
              calories: 777,
            }),
          ],
        })
      );
    }
  );

  it('reuses an existing named portion when the initial create resolves to an existing food', async () => {
    const reference = createVariant({
      id: 'existing-default',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      is_default: true,
    });
    const portion = createVariant({
      id: 'existing-portion',
      serving_unit: 'Package (150 g)',
      calories: 300,
    });
    const saved = createFood({
      id: 'existing-food',
      default_variant: reference,
    });
    mockApiCall
      .mockResolvedValueOnce(saved)
      .mockResolvedValueOnce([reference, portion]);
    await saveFood(
      createFood(),
      [reference, { ...portion, id: undefined }],
      'user-1',
      undefined,
      undefined,
      undefined,
      { managedPortions: [{ draftIndex: 1 }] }
    );
    expect(
      mockApiCall.mock.calls.some(
        ([url]) => url === '/foods/food-variants/bulk'
      )
    ).toBe(false);
  });

  it('preserves unrelated existing variants when a deduplicated new-food save is resumed', async () => {
    const reference = createVariant({
      id: 'existing-default',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      is_default: true,
    });
    const saved = createFood({
      id: 'existing-food',
      default_variant: reference,
    });
    const variants = [
      createVariant({ serving_size: 100, serving_unit: 'g', calories: 100 }),
      createVariant({ serving_unit: 'Package (150 g)', calories: 150 }),
    ];
    mockApiCall.mockImplementation(async (url) =>
      url.includes('food-variants?')
        ? [
            reference,
            createVariant({
              id: 'unrelated-slice',
              serving_unit: 'Custom slice',
            }),
          ]
        : saved
    );
    await saveFood(
      createFood(),
      variants,
      'user-1',
      'existing-food',
      undefined,
      undefined,
      {
        createProgress: {
          savedFood: saved,
          baselineVariantIds: ['existing-default', 'unrelated-slice'],
          attemptedVariantKeys: ['1|package (150 g)'],
        },
        managedPortions: [{ draftIndex: 1 }],
      }
    );
    expect(
      mockApiCall.mock.calls.some(([, options]) => options?.method === 'DELETE')
    ).toBe(false);
    expect(
      mockApiCall.mock.calls.some(([, options]) => options?.method === 'PUT')
    ).toBe(false);
  });

  it('applies postfailure edits and removes only this save attempt portions while preserving preexisting units', async () => {
    const draft = createFood();
    const reference = createVariant({
      id: 'existing-default',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      is_default: true,
    });
    const custom = createVariant({
      id: 'unrelated-slice',
      serving_unit: 'Custom slice',
      calories: 123,
    });
    const portion = createVariant({
      id: 'attempted-package',
      serving_unit: 'Package (150 g)',
      calories: 300,
    });
    const saved = createFood({
      id: 'existing-food',
      default_variant: reference,
    });
    const variants = [
      createVariant({ serving_size: 100, serving_unit: 'g', calories: 100 }),
      createVariant({ serving_unit: 'Package (150 g)', calories: 150 }),
    ];
    const progress: FoodCreateProgress = {};
    let rows = [reference, custom];
    mockApiCall.mockImplementation(async (url, options) => {
      if (url.includes('food-variants?')) return rows;
      if (url === '/foods/food-variants/bulk') {
        rows = [...rows, portion];
        throw new Error('Response lost after commit');
      }
      if (options?.method === 'DELETE') return undefined;
      return saved;
    });
    const saveOptions = {
      createProgress: progress,
      managedPortions: [{ draftIndex: 1 }],
    };
    await expect(
      saveFood(
        draft,
        variants,
        'user-1',
        undefined,
        undefined,
        undefined,
        saveOptions
      )
    ).rejects.toThrow('Response lost');
    await saveFood(
      { ...draft, id: saved.id, name: 'Edited after failure' },
      [{ ...variants[0]!, calories: 120 }],
      'user-1',
      saved.id,
      undefined,
      undefined,
      saveOptions
    );
    expect(mockApiCall).toHaveBeenCalledWith(
      '/foods/existing-food',
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({ name: 'Edited after failure' }),
      })
    );
    expect(mockApiCall).toHaveBeenCalledWith(
      '/foods/food-variants/existing-default',
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({ calories: 120 }),
      })
    );
    const deletions = mockApiCall.mock.calls.filter(
      ([, options]) => options?.method === 'DELETE'
    );
    expect(deletions.map(([url]) => url)).toEqual([
      '/foods/food-variants/attempted-package',
    ]);
    expect(progress.savedFood?.default_variant?.calories).toBe(120);
  });

  it('updates an ambiguously committed portion from an explicitly edited reference on retry', async () => {
    const draft = createFood();
    const reference = createVariant({
      id: 'existing-default',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      is_default: true,
    });
    const portion = createVariant({
      id: 'attempted-package',
      serving_unit: 'Package (150 g)',
      calories: 300,
    });
    const saved = createFood({
      id: 'existing-food',
      default_variant: reference,
    });
    const variants = [
      createVariant({ serving_size: 100, serving_unit: 'g', calories: 100 }),
      createVariant({ serving_unit: 'Package (150 g)', calories: 150 }),
    ];
    const progress: FoodCreateProgress = {};
    let rows = [reference];
    mockApiCall.mockImplementation(async (url) => {
      if (url.includes('food-variants?')) return rows;
      if (url === '/foods/food-variants/bulk') {
        rows = [...rows, portion];
        throw new Error('Response lost after commit');
      }
      return saved;
    });
    const saveOptions = {
      createProgress: progress,
      managedPortions: [{ draftIndex: 1 }],
    };
    await expect(
      saveFood(
        draft,
        variants,
        'user-1',
        undefined,
        undefined,
        undefined,
        saveOptions
      )
    ).rejects.toThrow('Response lost');
    await saveFood(
      { ...draft, id: saved.id },
      [{ ...variants[0]!, calories: 120 }, variants[1]!],
      'user-1',
      saved.id,
      undefined,
      undefined,
      saveOptions
    );
    expect(mockApiCall).toHaveBeenCalledWith(
      '/foods/food-variants/attempted-package',
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({ calories: 180 }),
      })
    );
    expect(
      mockApiCall.mock.calls.filter(([url]) => url === '/foods').length
    ).toBe(1);
    expect(
      mockApiCall.mock.calls.filter(
        ([url]) => url === '/foods/food-variants/bulk'
      ).length
    ).toBe(1);
  });

  it('calculates new named portions from the reference retained by barcode/provider deduplication', async () => {
    const reference = createVariant({
      id: 'existing-default',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      is_default: true,
    });
    const saved = createFood({
      id: 'existing-food',
      default_variant: reference,
    });
    const variants = [
      createVariant({ serving_size: 100, serving_unit: 'g', calories: 100 }),
      createVariant({ serving_unit: 'Package (150 g)', calories: 150 }),
    ];
    mockApiCall.mockResolvedValueOnce(saved).mockResolvedValueOnce([]);
    await saveFood(
      createFood(),
      variants,
      'user-1',
      undefined,
      undefined,
      undefined,
      { managedPortions: [{ draftIndex: 1 }] }
    );
    expect(
      mockApiCall.mock.calls.find(
        ([url]) => url === '/foods/food-variants/bulk'
      )?.[1]?.body
    ).toEqual([
      expect.objectContaining({
        serving_unit: 'Package (150 g)',
        calories: 300,
      }),
    ]);
  });

  it('retains the created food identity when saving additional portions fails, so retry updates one food', async () => {
    const variants = [
      createVariant({ serving_size: 100, serving_unit: 'g' }),
      createVariant({ serving_unit: 'Package (150 g)' }),
    ];
    const onFoodPersisted = jest.fn();
    mockApiCall
      .mockResolvedValueOnce({ id: 'created-food' })
      .mockRejectedValueOnce(new Error('Portions unavailable'));
    await expect(
      saveFood(
        createFood(),
        variants,
        'user-1',
        undefined,
        undefined,
        onFoodPersisted
      )
    ).rejects.toThrow('Portions unavailable');
    expect(onFoodPersisted).toHaveBeenCalledWith({ id: 'created-food' });
    mockApiCall
      .mockResolvedValueOnce({ id: 'created-food' })
      .mockResolvedValueOnce([{ ...variants[0], id: 'default-variant' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: 'portion-variant' }]);
    await saveFood(
      createFood({ id: 'created-food' }),
      variants,
      'user-1',
      'created-food'
    );
    expect(
      mockApiCall.mock.calls.filter(
        ([url, options]) => url === '/foods' && options?.method === 'POST'
      )
    ).toHaveLength(1);
    const bulkCalls = mockApiCall.mock.calls.filter(
      ([url]) => url === '/foods/food-variants/bulk'
    );
    expect(bulkCalls[1]?.[1]?.body).toEqual([
      expect.objectContaining({ serving_unit: 'Package (150 g)' }),
    ]);
  });

  it('reads back and reuses an already-created portion after an ambiguous bulk-save failure', async () => {
    const variants = [
      createVariant({
        id: 'default-variant',
        serving_size: 100,
        serving_unit: 'g',
      }),
      createVariant({ serving_unit: 'Package (150 g)' }),
    ];
    mockApiCall
      .mockResolvedValueOnce({ id: 'food-1' })
      .mockResolvedValueOnce([
        variants[0],
        { ...variants[1], id: 'previous-attempt-portion' },
      ])
      .mockResolvedValue(undefined);
    await saveFood(createFood({ id: 'food-1' }), variants, 'user-1', 'food-1');
    expect(mockApiCall).toHaveBeenCalledWith(
      '/foods/food-variants/previous-attempt-portion',
      expect.objectContaining({ method: 'PUT' })
    );
    expect(
      mockApiCall.mock.calls.some(
        ([url]) => url === '/foods/food-variants/bulk'
      )
    ).toBe(false);
    expect(
      mockApiCall.mock.calls.some(([, options]) => options?.method === 'DELETE')
    ).toBe(false);
  });

  it('does not persist provider serving display metadata when creating a single food variant', async () => {
    mockApiCall.mockResolvedValue({ id: 'variant-1' });

    await createFoodVariant('food-1', createVariant());

    expect(mockApiCall).toHaveBeenCalledWith(
      '/foods/food-variants',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'piece',
        }),
      })
    );
    const body1 = mockApiCall.mock.calls[0]?.[1]?.body as Record<
      string,
      unknown
    >;
    expect(body1).not.toHaveProperty('serving_description');
  });

  it('preserves provider verified without persisting serving display metadata when saving a new barcode food', async () => {
    mockApiCall.mockResolvedValueOnce({ id: 'food-1' });

    await saveFood(createFood(), [createVariant()], 'user-1');

    expect(mockApiCall).toHaveBeenCalledWith(
      '/foods',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          barcode: '1234567890123',
          provider_type: 'yazio',
          provider_external_id: 'yazio-apple-1',
          provider_verified: true,
        }),
      })
    );
    const body2 = mockApiCall.mock.calls[0]?.[1]?.body as Record<
      string,
      unknown
    >;
    expect(body2).not.toHaveProperty('serving_description');
  });

  // Regression: every payload here is built field-by-field, and the run of
  // numeric nutrients stopped at `iron` -- so caffeine, water, alcohol and ABV
  // were silently dropped at the last hop. The values reached the form and the
  // server column existed, but a food saved with them came back empty.
  it('sends caffeine, water, alcohol and ABV when creating a new food', async () => {
    mockApiCall.mockResolvedValueOnce({ id: 'food-1' });

    await saveFood(
      createFood(),
      [
        createVariant({
          caffeine_mg: 95,
          water_ml: 240,
          alcohol_g: 14,
          abv_percent: 5.2,
        }),
      ],
      'user-1'
    );

    const body = mockApiCall.mock.calls[0]?.[1]?.body as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      caffeine_mg: 95,
      water_ml: 240,
      alcohol_g: 14,
      abv_percent: 5.2,
    });
  });

  it('sends caffeine, water, alcohol and ABV when updating an existing variant', async () => {
    mockApiCall
      .mockResolvedValueOnce(undefined) // PUT /foods/:id
      .mockResolvedValueOnce([{ id: 'variant-1' }]) // existing variants
      .mockResolvedValueOnce(undefined); // PUT /foods/food-variants/:id

    await saveFood(
      createFood({ id: 'food-1' }),
      [
        createVariant({
          id: 'variant-1',
          caffeine_mg: 95,
          water_ml: 240,
          alcohol_g: 14,
          abv_percent: 5.2,
        }),
      ],
      'user-1',
      'food-1'
    );

    const variantPut = mockApiCall.mock.calls.find(
      ([url, options]) =>
        url === '/foods/food-variants/variant-1' && options?.method === 'PUT'
    );
    expect(variantPut?.[1]?.body).toMatchObject({
      caffeine_mg: 95,
      water_ml: 240,
      alcohol_g: 14,
      abv_percent: 5.2,
    });
  });

  // Regression: the create branch built its payload field-by-field and omitted
  // `images` entirely, so a provider photo carried through the edit form was
  // dropped at the last hop and the saved food had no image.
  it('sends the images array when creating a new food', async () => {
    mockApiCall.mockResolvedValueOnce({ id: 'food-1' });

    await saveFood(
      createFood({
        images: ['https://images.openfoodfacts.org/front_en.879.400.jpg'],
      }),
      [createVariant()],
      'user-1'
    );

    expect(mockApiCall).toHaveBeenCalledWith(
      '/foods',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          images: ['https://images.openfoodfacts.org/front_en.879.400.jpg'],
        }),
      })
    );
  });

  it('sends an empty images array when creating a food with no images', async () => {
    mockApiCall.mockResolvedValueOnce({ id: 'food-1' });

    await saveFood(createFood(), [createVariant()], 'user-1');

    expect(mockApiCall).toHaveBeenCalledWith(
      '/foods',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ images: [] }),
      })
    );
  });

  it('does not persist serving display metadata for additional variants on new foods', async () => {
    mockApiCall
      .mockResolvedValueOnce({ id: 'food-1' })
      .mockResolvedValueOnce([{ id: 'variant-2' }]);

    await saveFood(
      createFood(),
      [
        createVariant({
          serving_size: 100,
          serving_unit: 'g',
          serving_description: '100 g',
        }),
        createVariant({
          serving_size: 1,
          serving_unit: 'whole',
          serving_description: '1 whole (20 g)',
        }),
      ],
      'user-1'
    );

    expect(mockApiCall).toHaveBeenCalledWith(
      '/foods/food-variants/bulk',
      expect.objectContaining({
        method: 'POST',
        body: [
          expect.objectContaining({
            serving_size: 1,
            serving_unit: 'whole',
          }),
        ],
      })
    );
    const body = mockApiCall.mock.calls[1]?.[1]?.body as Record<
      string,
      unknown
    >;
    expect(Array.isArray(body) ? body[0] : body).not.toHaveProperty(
      'serving_description'
    );
  });
});
