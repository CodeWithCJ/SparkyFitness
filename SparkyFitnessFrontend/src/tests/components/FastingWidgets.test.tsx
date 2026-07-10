import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FastingTimerRing from '@/pages/Fasting/FastingTimerRing';
import FastingZoneBar from '@/pages/Fasting/FastingZoneBar';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string | Record<string, string | number>,
      options?: Record<string, string | number>
    ) => {
      const values =
        typeof defaultValue === 'object' ? defaultValue : (options ?? {});
      const translations: Record<string, string> = {
        'fasting.durationLabel': 'مدة الصيام',
        'fasting.goalReached': 'اكتملت المدة',
        'fasting.progressPercent': '{{progress}}٪',
        'fasting.timerLabel':
          'مدة الصيام المنقضية: {{duration}}. اكتمل {{progress}}.',
        'fasting.hourMarker': '{{hours}} س',
        'fasting.zonesLabel': 'الخط الزمني للصيام',
        'fasting.zoneRange': '{{start}}–{{end}} س',
        'fasting.zoneRangeOpen': '{{start}} س فأكثر',
        'fasting.zones.starting.name': 'بداية الصيام',
        'fasting.zones.starting.description': 'أول أربع ساعات بعد آخر وجبة.',
        'fasting.zones.daily.name': 'الصيام اليومي',
        'fasting.zones.daily.description': 'مدة شائعة في أنظمة الصيام اليومية.',
        'fasting.zones.extended.name': 'صيام ممتد',
        'fasting.zones.extended.description': 'انتبه للسوائل وأعراض التعب.',
        'fasting.zones.long.name': 'صيام طويل',
        'fasting.zones.long.description':
          'الصيام الطويل قد يحتاج توجيهًا طبيًا.',
        'fasting.zones.veryLong.name': 'صيام طويل جدًا',
        'fasting.zones.veryLong.description': 'لا تكمل بدون إشراف طبي.',
      };
      const fallback = typeof defaultValue === 'string' ? defaultValue : key;
      const template = translations[key] ?? fallback;
      return Object.entries(values).reduce(
        (value, [name, replacement]) =>
          value.replaceAll(`{{${name}}}`, String(replacement)),
        template
      );
    },
  }),
}));

describe('fasting widgets', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-10T08:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('localizes the timer state, progress, and hour markers', () => {
    render(
      <FastingTimerRing
        startTime={new Date('2026-07-10T00:00:00.000Z')}
        targetEndTime={new Date('2026-07-10T16:00:00.000Z')}
      />
    );

    expect(screen.getByRole('timer')).toHaveAccessibleName(
      'مدة الصيام المنقضية: 08:00:00. اكتمل 50٪.'
    );
    expect(screen.getByText('الصيام اليومي')).toBeInTheDocument();
    expect(screen.getByText('50٪')).toBeInTheDocument();
    expect(screen.getByText('16 س')).toBeInTheDocument();
    expect(screen.queryByText('Catabolic')).not.toBeInTheDocument();
  });

  it('uses neutral localized time ranges instead of medical claims', () => {
    render(<FastingZoneBar hoursFasted={17} />);

    expect(screen.getByText('الخط الزمني للصيام')).toBeInTheDocument();
    expect(
      screen.getByLabelText('صيام ممتد: 16–24 س. انتبه للسوائل وأعراض التعب.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Anabolic|Ketosis|Autophagy/)
    ).not.toBeInTheDocument();
  });

  it('labels fasts beyond 72 hours with the medical-supervision state', () => {
    render(
      <FastingTimerRing
        startTime={new Date('2026-07-07T00:00:00.000Z')}
        targetEndTime={new Date('2026-07-10T00:00:00.000Z')}
      />
    );

    expect(screen.getByText('صيام طويل جدًا')).toBeInTheDocument();
  });
});
