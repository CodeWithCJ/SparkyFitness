import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HeartRateZoneLegend } from '@/components/HeartRateZoneLegend';
import { resolveHeartRateZones } from '@workspace/shared';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: string | Record<string, unknown>) => {
      if (typeof opts === 'string') return opts;
      const o = (opts ?? {}) as Record<string, string | number>;
      return String(o['defaultValue'] ?? _key).replace(
        /\{\{(\w+)\}\}/g,
        (_m, k: string) => String(o[k])
      );
    },
  }),
}));

const resolved = resolveHeartRateZones({
  settings: {
    maxHeartRate: 188,
    restingHeartRate: 68,
    method: 'heart_rate_reserve',
  },
  today: '2026-10-25',
});

describe('HeartRateZoneLegend', () => {
  it('shows all five of the person zones with their ranges', () => {
    render(
      <MemoryRouter>
        <HeartRateZoneLegend resolved={resolved} showSource />
      </MemoryRouter>
    );
    expect(
      screen.getByTestId('heart-rate-zone-legend-1').textContent
    ).toContain('Zone 1128–139 bpm');
    expect(
      screen.getByTestId('heart-rate-zone-legend-3').textContent
    ).toContain('152–163');
    expect(
      screen.getByTestId('heart-rate-zone-legend-5').textContent
    ).toContain('176+ bpm');
    expect(screen.getByTestId('heart-rate-zone-source').textContent).toMatch(
      /Heart rate reserve, max heart rate 188 bpm/
    );
    expect(
      screen.getByRole('link', { name: /zone settings/i }).getAttribute('href')
    ).toBe('/settings?tab=heart-rate-zones');
  });

  it('shows the four tiers when chosen', () => {
    render(
      <MemoryRouter>
        <HeartRateZoneLegend resolved={resolved} displayZones={4} />
      </MemoryRouter>
    );
    expect(
      screen.getByTestId('heart-rate-zone-legend-1').textContent
    ).toContain('Light128–151 bpm');
    expect(
      screen.getByTestId('heart-rate-zone-legend-4').textContent
    ).toContain('Peak176+ bpm');
    expect(screen.queryByTestId('heart-rate-zone-legend-5')).toBeNull();
  });

  it('says so while the zones are the defaults', () => {
    render(
      <MemoryRouter>
        <HeartRateZoneLegend resolved={resolved} isDefault showSource />
      </MemoryRouter>
    );
    expect(screen.getByTestId('heart-rate-zone-source').textContent).toMatch(
      /until your own zones load/
    );
  });
});
