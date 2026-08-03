import { exportFoodDiary } from '@/utils/reportUtil';
import { DailyFoodEntry } from '@/types/reports';

// Mock dependencies
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    t: (_key: string, defaultValue?: string) => defaultValue || _key,
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
  beforeEach(() => {
    jest.clearAllMocks();
    global.URL.createObjectURL = jest.fn(() => 'blob:test-url');
    global.URL.revokeObjectURL = jest.fn();
  });

  it('exports CSV with correct non-double-scaled nutrient values', async () => {
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
