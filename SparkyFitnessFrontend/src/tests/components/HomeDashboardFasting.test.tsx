import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomeDashboardFasting from '@/pages/CheckIn/HomeDashboardFasting';

let mockActiveFast: null | {
  id: string;
  start_time: string;
  target_end_time: string;
} = null;
const mockStartFast = jest.fn();

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
        'fasting.timerTitle': 'مؤقّت الصيام',
        'fasting.activeDescription': 'صيامك شغّال.',
        'fasting.readyDescription': 'جاهز تبدأ صيامك؟',
        'fasting.startFast': 'بدء الصيام',
        'fasting.endFast': 'إنهاء الصيام',
        'fasting.totalFasts': 'مرات الصيام',
        'fasting.averageDuration': 'متوسط المدة',
        'fasting.startDialogTitle': 'ابدأ صيام جديد',
        'fasting.startDialogDescription':
          'اختر المدة اللي تناسبك وحدد وقت البداية.',
        'fasting.startTime': 'وقت البداية',
        'fasting.protocol': 'مدة الصيام',
        'fasting.cancel': 'إلغاء',
        'fasting.confirmStart': 'ابدأ الصيام',
        'fasting.safetyNote':
          'إذا عندك سكري أو مرض مزمن أو تستخدم أدوية بانتظام، استشر طبيبك قبل الصيام.',
        'fasting.presets.sixteenEight.name': 'نظام 16:8',
        'fasting.presets.sixteenEight.description':
          'صيام 16 ساعة ونافذة أكل 8 ساعات.',
        'units.hourMinuteValue': '{{hours}} س {{minutes}} د',
        'units.minuteValue': '{{value}} د',
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

jest.mock('@/hooks/Fasting/useFasting', () => ({
  useCurrentFast: () => ({ data: mockActiveFast, isLoading: false }),
  useStartFastMutation: () => ({ mutateAsync: mockStartFast }),
  useEndFastMutation: () => ({ mutate: jest.fn() }),
  useFastingStats: () => ({
    data: {
      total_completed_fasts: 7,
      average_duration_minutes: '990',
    },
  }),
}));

jest.mock('@/pages/Fasting/FastingTimerRing', () => ({
  __esModule: true,
  default: () => <div>حلقة الصيام</div>,
}));

jest.mock('@/pages/Fasting/FastingZoneBar', () => ({
  __esModule: true,
  default: () => <div>مراحل الصيام</div>,
}));

jest.mock('@/pages/Fasting/EndFastDialog', () => ({
  __esModule: true,
  default: () => null,
}));

describe('HomeDashboardFasting', () => {
  beforeEach(() => {
    mockActiveFast = null;
    mockStartFast.mockReset();
    mockStartFast.mockResolvedValue(undefined);
  });

  it('localizes the empty card and start dialog', () => {
    render(<HomeDashboardFasting />);

    expect(screen.getByText('مؤقّت الصيام')).toBeInTheDocument();
    expect(screen.getByText('جاهز تبدأ صيامك؟')).toBeInTheDocument();
    expect(screen.getByText('16 س 30 د')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('استشر طبيبك');

    fireEvent.click(screen.getByRole('button', { name: 'بدء الصيام' }));

    expect(
      screen.getByRole('dialog', { name: 'ابدأ صيام جديد' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('وقت البداية')).toBeInTheDocument();
    expect(screen.getByLabelText('مدة الصيام')).toBeInTheDocument();
    expect(screen.getByText('نظام 16:8 (16:8)')).toBeInTheDocument();
    expect(
      screen.getByText('صيام 16 ساعة ونافذة أكل 8 ساعات.')
    ).toBeInTheDocument();
  });

  it('localizes the active-fast state and actions', () => {
    mockActiveFast = {
      id: 'fast-1',
      start_time: '2026-07-10T00:00:00.000Z',
      target_end_time: '2026-07-10T16:00:00.000Z',
    };

    render(<HomeDashboardFasting />);

    expect(screen.getByText('صيامك شغّال.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'إنهاء الصيام' })
    ).toBeInTheDocument();
    expect(screen.getByText('مرات الصيام')).toBeInTheDocument();
    expect(screen.getByText('متوسط المدة')).toBeInTheDocument();
  });
});
