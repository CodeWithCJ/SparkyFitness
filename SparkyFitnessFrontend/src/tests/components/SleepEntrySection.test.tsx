import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SleepEntrySection from '@/pages/CheckIn/SleepEntrySection';

const mockDeleteSleepEntry = jest.fn();
let mockLoading = false;

const mockSleepEntries = [
  {
    id: 'sleep-1',
    entry_date: '2026-07-10',
    bedtime: '2026-07-09T22:00:00.000Z',
    wake_time: '2026-07-10T06:00:00.000Z',
    duration_in_seconds: 28800,
    time_asleep_in_seconds: 27000,
    source: 'manual',
    stage_events: [],
  },
];

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
        'sleepEntrySection.loading': 'جارٍ تحميل بيانات النوم…',
        'sleepEntrySection.sleepTracking': 'متابعة النوم',
        'sleepEntrySection.sleepSession': 'فترة النوم {{sessionNumber}}',
        'sleepEntrySection.bedtime': 'وقت النوم',
        'sleepEntrySection.wakeTime': 'وقت الاستيقاظ',
        'sleepEntrySection.addAnotherSleepSession': 'إضافة فترة نوم',
        'sleepEntrySection.saveSleep': 'حفظ النوم',
        'sleepEntrySection.sleepEntryFor': 'تسجيل النوم ليوم {{date}}',
        'sleepEntrySection.cancelEdit': 'إلغاء تعديل تسجيل النوم',
        'sleepEntrySection.saveEdit': 'حفظ تعديل تسجيل النوم',
        'sleepEntrySection.editEntry': 'تعديل تسجيل النوم',
        'sleepEntrySection.deleteEntry': 'حذف تسجيل النوم',
        'sleepEntrySection.deleteConfirmTitle': 'تحذف تسجيل النوم؟',
        'sleepEntrySection.deleteConfirmDescription':
          'بينحذف التسجيل ومراحل النوم المرتبطة فيه. ما تقدر ترجع هالخطوة.',
        'sleepEntrySection.deleteConfirmAction': 'حذف التسجيل',
        'sleepEntrySection.cancel': 'إلغاء',
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

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'silent',
    formatDateInUserTimezone: (_date: string | Date, format?: string) => {
      if (format === 'PPP') return '١٠ يوليو ٢٠٢٦';
      if (format === 'p') return '١٠:٠٠ م';
      return '';
    },
  }),
}));

jest.mock('@/hooks/CheckIn/useSleep', () => ({
  useSleepEntriesQuery: () => ({
    data: mockSleepEntries,
    isLoading: mockLoading,
  }),
  useSaveSleepEntryMutation: () => ({ mutateAsync: jest.fn() }),
  useUpdateSleepEntryMutation: () => ({ mutateAsync: jest.fn() }),
  useDeleteSleepEntryMutation: () => ({
    mutateAsync: mockDeleteSleepEntry,
  }),
}));

jest.mock('@/pages/CheckIn/SleepTimelineEditor', () => ({
  __esModule: true,
  default: ({ entryDetails }: { entryDetails?: { duration: string } }) => (
    <div data-testid="sleep-timeline">{entryDetails?.duration}</div>
  ),
}));

describe('SleepEntrySection', () => {
  beforeEach(() => {
    mockLoading = false;
    mockDeleteSleepEntry.mockReset();
    mockDeleteSleepEntry.mockResolvedValue(undefined);
  });

  it('shows a localized loading status', () => {
    mockLoading = true;

    render(<SleepEntrySection selectedDate="2026-07-10" />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'جارٍ تحميل بيانات النوم…'
    );
  });

  it('localizes entries and confirms before deletion', () => {
    render(<SleepEntrySection selectedDate="2026-07-10" />);

    expect(
      screen.getByText('تسجيل النوم ليوم ١٠ يوليو ٢٠٢٦')
    ).toBeInTheDocument();
    expect(screen.getByTestId('sleep-timeline')).toHaveTextContent('8 س 0 د');
    expect(
      screen.getByRole('button', { name: 'تعديل تسجيل النوم' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'حذف تسجيل النوم' }));

    expect(mockDeleteSleepEntry).not.toHaveBeenCalled();
    expect(
      screen.getByRole('alertdialog', { name: 'تحذف تسجيل النوم؟' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'حذف التسجيل' }));

    expect(mockDeleteSleepEntry).toHaveBeenCalledWith('sleep-1');
  });
});
