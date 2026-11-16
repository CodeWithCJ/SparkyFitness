import { exportBodyMeasurements, exportFoodDiary } from '@/utils/reportUtil';
import { DailyFoodEntry } from '@/types/reports';
import { UserCustomNutrient } from '@/types/customNutrient';
import type { CheckInMeasurementsResponse } from '@workspace/shared';

// Mock dependencies
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    t: (
      _key: string,
      defaultValue?: string,
      options?: Record<string, string>
    ) =>
      (defaultValue || _key).replace(
        /{{(\w+)}}/g,
        (match, name) => options?.[name] ?? match
      ),
    use: jest.fn().mockReturnThis(),
    init: jest.fn(),
  },
}));

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
}));

describe('exportFoodDiary', () => {
  let createdBlobs: Blob[] = [];

  beforeAll(() => {
    if (!Blob.prototype.text) {
      Blob.prototype.text = function () {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(this);
        });
      };
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    createdBlobs = [];
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    global.URL.createObjectURL = jest.fn((blob: Blob) => {
      createdBlobs.push(blob);
      return 'blob:test-url';
    });
    global.URL.revokeObjectURL = jest.fn();
  });

  it('exports CSV with correct non-double-scaled nutrient values and asserts CSV content', async () => {
    const appendChildSpy = jest
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node) => node);
    const removeChildSpy = jest
      .spyOn(document.body, 'removeChild')
      .mockImplementation((node) => node);

    // Entry where quantity (120) != serving_size (50)
    // Pre-calculated values in tabularData: calories = 184, protein = 15.6, carbs = 1.4, fat = 12.8
    const sampleEntry: DailyFoodEntry = {
      entry_date: '2026-08-03',
      meal_type: 'breakfast',
      food_name: 'Eggs',
      brand_name: 'Farm Fresh',
      quantity: 120,
      unit: 'g',
      calories: 184,
      protein: 15.6,
      carbs: 1.4,
      fat: 12.8,
      dietary_fiber: 0,
    };

    const mockFormatDate = (date: string | Date) =>
      typeof date === 'string' ? date : '2026-08-03';
    const mockConvertEnergy = (val: number) => val;

    await exportFoodDiary({
      loggingLevel: 'INFO',
      tabularData: [sampleEntry],
      energyUnit: 'kcal',
      customNutrients: [],
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      formatDateInUserTimezone: mockFormatDate,
      convertEnergy: mockConvertEnergy,
      showNetCarbs: false,
    });

    expect(appendChildSpy).toHaveBeenCalled();
    const calls = appendChildSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const linkElement = calls[0]![0] as HTMLAnchorElement;
    expect(linkElement.download).toContain(
      'food - diary - 2026-08-01 -to - 2026-08-03.csv'
    );

    // Assert CSV content from Blob
    expect(createdBlobs.length).toBe(1);
    const csvContent = await createdBlobs[0]!.text();
    const lines = csvContent.split('\n');

    // Check individual entry row: "2026-08-03","breakfast","Eggs","Farm Fresh","120","g","184","15.6","1.4","12.8",...
    const eggsRow = lines.find((line) => line.includes('"Eggs"'));
    expect(eggsRow).toBeDefined();
    expect(eggsRow).toContain('"184"');
    expect(eggsRow).toContain('"15.6"');
    expect(eggsRow).toContain('"1.4"');
    expect(eggsRow).toContain('"12.8"');

    // Check total row: "2026-08-03","Total","","","","","184","15.6","1.4","12.8",...
    const totalRow = lines.find((line) => line.includes('"Total"'));
    expect(totalRow).toBeDefined();
    expect(totalRow).toContain('"184"');
    expect(totalRow).toContain('"15.6"');

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('correctly accumulates custom nutrient totals across multiple entries', async () => {
    const appendChildSpy = jest
      .spyOn(document.body, 'appendChild')
      .mockImplementation((node) => node);
    const removeChildSpy = jest
      .spyOn(document.body, 'removeChild')
      .mockImplementation((node) => node);

    const customNutrients: UserCustomNutrient[] = [
      {
        id: '1',
        user_id: 'user1',
        name: 'Caffeine',
        unit: 'mg',
        aliases: [],
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      },
    ];

    const entry1: DailyFoodEntry = {
      entry_date: '2026-08-03',
      meal_type: 'breakfast',
      food_name: 'Coffee',
      quantity: 1,
      unit: 'cup',
      calories: 5,
      protein: 0.1,
      carbs: 0.8,
      fat: 0,
      Caffeine: 2.0,
    };

    const entry2: DailyFoodEntry = {
      entry_date: '2026-08-03',
      meal_type: 'lunch',
      food_name: 'Energy Drink',
      quantity: 1,
      unit: 'can',
      calories: 10,
      protein: 0,
      carbs: 2.0,
      fat: 0,
      Caffeine: 3.0,
    };

    await exportFoodDiary({
      loggingLevel: 'INFO',
      tabularData: [entry1, entry2],
      energyUnit: 'kcal',
      customNutrients,
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      formatDateInUserTimezone: (d) => String(d),
      convertEnergy: (v) => v,
      showNetCarbs: false,
    });

    expect(createdBlobs.length).toBe(1);
    const csvContent = await createdBlobs[0]!.text();
    const lines = csvContent.split('\n');

    // Total row should have Caffeine accumulated: 2.0 + 3.0 = 5.0
    const totalRow = lines.find((line) => line.includes('"Total"'));
    expect(totalRow).toBeDefined();
    expect(totalRow).toContain('"5.0"');

    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });

  it('shows error toast if tabularData is empty', async () => {
    await exportFoodDiary({
      loggingLevel: 'INFO',
      tabularData: [],
      energyUnit: 'kcal',
      customNutrients: [],
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      formatDateInUserTimezone: (d) => String(d),
      convertEnergy: (v) => v,
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'destructive',
      })
    );
  });
});

describe('exportBodyMeasurements', () => {
  it('writes values in the units named by the headers', async () => {
    let csv = '';
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    jest.spyOn(global, 'Blob').mockImplementation((parts) => {
      csv = String(parts?.[0]);
      return {} as Blob;
    });
    global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
    global.URL.revokeObjectURL = jest.fn();

    await exportBodyMeasurements({
      loggingLevel: 'ERROR',
      startDate: '2026-11-01',
      endDate: '2026-11-09',
      measurementData: [
        { entry_date: '2026-11-09', weight: 80, neck: 40 },
      ] as unknown as CheckInMeasurementsResponse[],
      defaultWeightUnit: 'lbs',
      defaultMeasurementUnit: 'inches',
      formatDateInUserTimezone: (date) => String(date),
      convertWeight: (value) => value * 2,
      convertMeasurement: (value) => value / 2,
    });

    expect(csv).toContain('"Weight (lbs)","Neck (inches)"');
    expect(csv).toContain('"160.0","20.0"');
  });

  it('writes stones and pounds, and feet and inches, as the table shows them', async () => {
    let csv = '';
    jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    jest.spyOn(global, 'Blob').mockImplementation((parts) => {
      csv = String(parts?.[0]);
      return {} as Blob;
    });
    global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
    global.URL.revokeObjectURL = jest.fn();

    await exportBodyMeasurements({
      loggingLevel: 'ERROR',
      startDate: '2026-11-01',
      endDate: '2026-11-09',
      measurementData: [
        { entry_date: '2026-11-09', weight: 80, neck: 40, height: 178 },
      ] as unknown as CheckInMeasurementsResponse[],
      defaultWeightUnit: 'st_lbs',
      defaultMeasurementUnit: 'ft_in',
      formatDateInUserTimezone: (date) => String(date),
      convertWeight: (value) => value,
      convertMeasurement: (value, _from, to) => (to === 'cm' ? value : NaN),
    });

    expect(csv).toContain('Neck (cm)');
    expect(csv).toContain('"12st 8.4lbs","40.0"');
    expect(csv).toContain(`"5'10.1"""`);
  });
});
