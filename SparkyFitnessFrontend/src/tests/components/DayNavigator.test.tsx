import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DayNavigator from '@/components/DayNavigator';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const translations: Record<string, string> = {
        'common.today': 'اليوم',
        'common.previousDay': 'اليوم السابق',
        'common.nextDay': 'اليوم التالي',
        'common.pickADate': 'اختر تاريخًا',
      };

      if (key === 'common.openDatePicker') {
        return `اختيار تاريخ. التاريخ الحالي: ${options?.['date']}`;
      }

      return translations[key] ?? key;
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDate: () => '10/07/2026',
    getDateRelationToToday: () => 'past',
    parseDateInUserTimezone: () => new Date(2026, 6, 10),
    timezone: 'Asia/Riyadh',
    loggingLevel: 'ERROR',
  }),
}));

jest.mock('@workspace/shared', () => ({
  addDays: (_date: string, amount: number) =>
    amount < 0 ? '2026-07-09' : '2026-07-11',
  localDateToDay: () => '2026-07-12',
  todayInZone: () => '2026-07-10',
}));

describe('DayNavigator', () => {
  it('localizes and exposes every date navigation action', () => {
    const onDateChange = jest.fn();

    render(
      <DayNavigator selectedDate="2026-07-09" onDateChange={onDateChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'اليوم السابق' }));
    fireEvent.click(screen.getByRole('button', { name: 'اليوم التالي' }));
    fireEvent.click(screen.getByRole('button', { name: 'اليوم' }));

    expect(onDateChange).toHaveBeenNthCalledWith(1, '2026-07-09');
    expect(onDateChange).toHaveBeenNthCalledWith(2, '2026-07-11');
    expect(onDateChange).toHaveBeenNthCalledWith(3, '2026-07-10');
    expect(
      screen.getByRole('button', {
        name: 'اختيار تاريخ. التاريخ الحالي: 10/07/2026',
      })
    ).toBeInTheDocument();
  });
});
