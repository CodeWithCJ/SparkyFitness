import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import EndFastDialog from '@/pages/Fasting/EndFastDialog';

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
        'fasting.endDialogTitle': 'تمّ صيامك',
        'fasting.endDialogDescription': 'صمت مدة {{duration}}.',
        'fasting.endDialogHelp':
          'إذا تأخرت في تشغيل المؤقّت أو إيقافه، عدّل الأوقات قبل الحفظ.',
        'fasting.startTime': 'وقت البداية',
        'fasting.endTime': 'وقت النهاية',
        'fasting.cancel': 'إلغاء',
        'fasting.confirmEnd': 'إنهاء وحفظ',
        'fasting.invalidTimeRange': 'لازم يكون وقت النهاية بعد وقت البداية.',
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

describe('EndFastDialog', () => {
  it('localizes the dialog and rejects an end time before the start', () => {
    const onClose = jest.fn();
    const onEnd = jest.fn();

    render(
      <EndFastDialog
        isOpen
        onClose={onClose}
        onEnd={onEnd}
        durationFormatted="16 س 0 د"
        initialStartISO="2026-07-10T10:00:00.000Z"
        initialEndISO="2026-07-10T09:00:00.000Z"
      />
    );

    expect(
      screen.getByRole('dialog', { name: 'تمّ صيامك' })
    ).toBeInTheDocument();
    expect(screen.getByText('صمت مدة 16 س 0 د.')).toBeInTheDocument();
    expect(screen.getByLabelText('وقت البداية')).toBeInTheDocument();
    expect(screen.getByLabelText('وقت النهاية')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إنهاء وحفظ' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'لازم يكون وقت النهاية بعد وقت البداية.'
    );
    expect(onEnd).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
