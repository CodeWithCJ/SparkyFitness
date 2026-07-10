import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SleepTimelineEditor from '@/pages/CheckIn/SleepTimelineEditor';

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
        'sleepTimelineEditor.bedtime': 'وقت النوم',
        'sleepTimelineEditor.wakeTime': 'وقت الاستيقاظ',
        'sleepTimelineEditor.duration': 'المدة',
        'sleepTimelineEditor.timeAsleep': 'مدة النوم الفعلية',
        'sleepTimelineEditor.sleepScore': 'درجة النوم',
        'sleepTimelineEditor.source': 'المصدر',
        'sleepTimelineEditor.sleepTimeline': 'مراحل النوم',
        'sleepTimelineEditor.awake': 'مستيقظ',
        'sleepTimelineEditor.rem': 'نوم حركة العين السريعة',
        'sleepTimelineEditor.light': 'نوم خفيف',
        'sleepTimelineEditor.deep': 'نوم عميق',
        'sleepTimelineEditor.clear': 'مسح المراحل',
        'sleepTimelineEditor.timelineLabel':
          'مراحل النوم من {{bedtime}} إلى {{wakeTime}}',
        'sleepTimelineEditor.stageInterval':
          '{{stage}}: من {{start}} إلى {{end}}',
        'sleepTimelineEditor.sources.manual': 'يدوي',
        'sleepEntrySection.deepSleep': 'النوم العميق',
        'sleepEntrySection.avgOvernightHrv': 'متوسط تباين النبض',
        'sleepEntrySection.restingHR': 'نبض الراحة',
        'units.hourMinuteValue': '{{hours}} س {{minutes}} د',
        'units.minuteValue': '{{value}} د',
        'units.millisecondShort': 'مللي ثانية',
        'units.bpm': 'نبضة/دقيقة',
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

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: (date: string | Date, formatString?: string) => {
      const value = String(date);
      if (formatString === 'p') {
        return value.includes('22:') ? '١٠:٠٠ م' : '٦:٠٠ ص';
      }
      return value;
    },
  }),
}));

describe('SleepTimelineEditor', () => {
  it('localizes sleep details, units, source, and timeline controls', () => {
    render(
      <SleepTimelineEditor
        bedtime="2026-07-09T22:00:00.000Z"
        wakeTime="2026-07-10T06:00:00.000Z"
        isEditing
        initialStageEvents={[
          {
            id: 'light-1',
            entry_id: 'sleep-1',
            stage_type: 'light',
            start_time: '2026-07-09T22:00:00.000Z',
            end_time: '2026-07-10T06:00:00.000Z',
            duration_in_seconds: 28800,
          },
        ]}
        entryDetails={{
          bedtime: '١٠:٠٠ م',
          wakeTime: '٦:٠٠ ص',
          duration: '8h 0m',
          source: 'manual',
          deepSleepSeconds: 5430,
          avgOvernightHrv: 42.5,
          restingHeartRate: 58,
        }}
      />
    );

    expect(
      screen.getByText(
        (_content, element) =>
          element?.textContent === 'متوسط تباين النبض: 42.5 مللي ثانية'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        (_content, element) =>
          element?.textContent === 'نبض الراحة: 58 نبضة/دقيقة'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('يدوي')).toBeInTheDocument();
    expect(screen.getByText('1 س 31 د')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'نوم خفيف' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(
      screen.getByLabelText('مراحل النوم من ١٠:٠٠ م إلى ٦:٠٠ ص')
    ).toBeInTheDocument();
    expect(
      screen.getByTitle('نوم خفيف: من ١٠:٠٠ م إلى ٦:٠٠ ص')
    ).toBeInTheDocument();
  });
});
