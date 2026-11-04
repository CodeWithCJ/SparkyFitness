import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { HealthMetricSamples } from '@workspace/shared';
import HRVCard from '@/pages/Reports/HRVCard';
import { useHealthMetricSamples } from '@/hooks/useGenericHealth';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : _key,
  }),
}));
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: () => 'Oct 28',
    formatTime: (iso: string) => iso.slice(11, 16),
  }),
}));
jest.mock('@/hooks/useGenericHealth', () => ({
  useHealthMetricSamples: jest.fn(),
}));

const DAY = '2026-10-28';

const row = (
  source: string,
  samples: Array<{ t: string; rmssd_ms: number }>
): HealthMetricSamples =>
  ({
    id: `hms-${source}`,
    user_id: 'user-1',
    metric: 'hrv',
    entry_date: DAY,
    source_provider: source,
    device_name: null,
    samples,
  }) as unknown as HealthMetricSamples;

describe('HRVCard', () => {
  it('offers the night series when only a later row of the day has samples', () => {
    jest.mocked(useHealthMetricSamples).mockReturnValue({
      data: [
        row('garmin', []),
        row('xiaomi', [{ t: `${DAY}T02:00:00Z`, rmssd_ms: 42 }]),
      ],
    } as unknown as ReturnType<typeof useHealthMetricSamples>);

    render(<HRVCard data={[{ date: DAY, avg_overnight_hrv: 45 }]} />);

    expect(
      screen.getByRole('button', { name: 'Night Series' })
    ).toBeInTheDocument();
  });
});
