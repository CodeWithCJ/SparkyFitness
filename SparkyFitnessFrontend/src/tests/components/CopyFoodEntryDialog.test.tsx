import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CopyFoodEntryDialog from '@/pages/Diary/CopyFoodEntryDialog';

const mockUseMealTypes = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const translations: Record<string, string> = {
        'foodDiary.copyFoodEntryDialog.title': 'نسخ سجلات الطعام',
        'foodDiary.copyFoodEntryDialog.description':
          'اختر التاريخ والوجبة اللي تبي تنسخ السجلات إليها.',
        'foodDiary.copyFoodEntryDialog.targetDate': 'التاريخ المطلوب',
        'foodDiary.copyFoodEntryDialog.mealType': 'نوع الوجبة',
        'foodDiary.copyFoodEntryDialog.selectMealTypePlaceholder':
          'اختر نوع الوجبة',
        'foodDiary.copyFoodEntryDialog.copyButton': 'نسخ',
        'foodDiary.copyFoodEntryDialog.loadingMealTypes':
          'جارٍ تحميل أنواع الوجبات…',
        'common.breakfast': 'الفطور',
        'common.cancel': 'إلغاء',
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
    formatDateInUserTimezone: (_date: Date, pattern?: string) =>
      pattern === 'yyyy-MM-dd' ? '2026-07-10' : '10 يوليو 2026',
    loggingLevel: 'ERROR',
  }),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => mockUseMealTypes(),
}));

describe('CopyFoodEntryDialog', () => {
  beforeEach(() => {
    mockUseMealTypes.mockReturnValue({
      data: [{ id: 'breakfast', name: 'breakfast' }],
      isLoading: false,
    });
  });

  it('renders the copy flow in Arabic and submits a calendar-day value', () => {
    const onCopy = jest.fn();

    render(
      <CopyFoodEntryDialog
        isOpen
        onClose={jest.fn()}
        onCopy={onCopy}
        sourceMealType="breakfast"
      />
    );

    expect(screen.getByText('نسخ سجلات الطعام')).toBeInTheDocument();
    expect(screen.getByLabelText('التاريخ المطلوب')).toHaveTextContent(
      '10 يوليو 2026'
    );
    expect(screen.getByLabelText('نوع الوجبة')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'نسخ' }));

    expect(onCopy).toHaveBeenCalledWith('2026-07-10', 'breakfast');
  });

  it('shows a localized meal-type loading state', () => {
    mockUseMealTypes.mockReturnValue({ data: undefined, isLoading: true });

    render(
      <CopyFoodEntryDialog
        isOpen
        onClose={jest.fn()}
        onCopy={jest.fn()}
        sourceMealType="breakfast"
      />
    );

    fireEvent.click(screen.getByLabelText('نوع الوجبة'));

    expect(screen.getByText('جارٍ تحميل أنواع الوجبات…')).toBeInTheDocument();
  });
});
