import { formatCustomChartData } from '@/utils/reportUtil';
import type {
  CustomCategoriesResponse,
  CustomMeasurementsResponse,
} from '@workspace/shared';

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: {
    t: (_key: string, defaultValue?: string) => defaultValue || _key,
    use: jest.fn().mockReturnThis(),
    init: jest.fn(),
  },
}));

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
  toast: jest.fn(),
}));

const category = (frequency: string) =>
  ({
    id: 'cat-1',
    name: 'Events',
    measurement_type: 'count',
    frequency,
    data_type: 'numeric',
  }) as unknown as CustomCategoriesResponse;

const entry = (overrides: Partial<CustomMeasurementsResponse>) =>
  ({
    id: 'entry-1',
    category_id: 'cat-1',
    value: '4',
    entry_date: '2026-11-15',
    entry_hour: null,
    entry_timestamp: '2026-11-15T05:12:30.000Z',
    notes: null,
    ...overrides,
  }) as unknown as CustomMeasurementsResponse;

const identity = (val: number) => val;

const format = (frequency: string, data: CustomMeasurementsResponse[]) =>
  formatCustomChartData(category(frequency), data, 'ERROR', identity, 'cm');

describe('formatCustomChartData', () => {
  it("places 'All' entries at their exact timestamp when no hour is stored", () => {
    const result = format('All', [
      entry({ id: 'a', entry_timestamp: '2026-11-15T05:12:30.000Z' }),
      entry({ id: 'b', entry_timestamp: '2026-11-15T18:47:00.000Z' }),
    ]);

    expect(result.map((row) => row.date)).toEqual([
      '2026-11-15T05:12:30.000Z',
      '2026-11-15T18:47:00.000Z',
    ]);
  });

  it("prefers the exact timestamp over a stored hour for 'All' entries", () => {
    const result = format('All', [entry({ entry_hour: 6 })]);

    expect(result[0]?.date).toBe('2026-11-15T05:12:30.000Z');
  });

  it("keeps the hour bucket for 'Hourly' entries", () => {
    const result = format('Hourly', [entry({ entry_hour: 6 })]);

    expect(result[0]?.date).toBe('2026-11-15 06:00');
  });

  it('falls back to the calendar day when neither hour nor timestamp exists', () => {
    const result = format('All', [entry({ entry_timestamp: undefined })]);

    expect(result[0]?.date).toBe('2026-11-15');
  });
});
