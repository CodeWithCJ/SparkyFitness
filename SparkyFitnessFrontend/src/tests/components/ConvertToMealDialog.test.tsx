import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConvertToMealDialog from '@/pages/Diary/ConvertToMealDialog';

const mockCreateMeal = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      const translations: Record<string, string> = {
        'mealCreation.convertToMeal': 'حفظها كوجبة',
        'mealCreation.enterDetails':
          'سمّ الوجبة، وأضف وصفًا يساعدك تلقاها بعدين.',
        'mealCreation.mealName': 'اسم الوجبة',
        'mealCreation.mealNamePlaceholder': 'مثل: فطور الدوام',
        'mealCreation.description': 'الوصف',
        'mealCreation.descriptionPlaceholder': 'وصف مختصر للوجبة (اختياري)',
        'mealCreation.makePublic': 'مشاركة الوجبة علنًا',
        'mealCreation.publicHelp':
          'إذا فعلتها، يقدر مستخدمو التطبيق يشوفون الوجبة.',
        'common.breakfast': 'الفطور',
        'common.cancel': 'إلغاء',
        'common.create': 'حفظ الوجبة',
      };

      if (key === 'mealCreation.defaultMealName') {
        return `${options?.['mealType']} — ${options?.['date']}`;
      }

      return translations[key] ?? key;
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    formatDate: () => '10 يوليو 2026',
  }),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useCreateMealFromDiaryMutation: () => ({
    mutate: mockCreateMeal,
    isPending: false,
  }),
}));

describe('ConvertToMealDialog', () => {
  it('creates a reusable meal through a localized Arabic form', () => {
    render(
      <ConvertToMealDialog
        isOpen
        onClose={jest.fn()}
        selectedDate="2026-07-10"
        mealType="breakfast"
      />
    );

    expect(screen.getByText('حفظها كوجبة')).toBeInTheDocument();
    expect(screen.getByLabelText('اسم الوجبة')).toHaveValue(
      'الفطور — 10 يوليو 2026'
    );
    expect(screen.getByLabelText('الوصف')).toHaveAttribute(
      'placeholder',
      'وصف مختصر للوجبة (اختياري)'
    );
    expect(
      screen.getByRole('switch', { name: 'مشاركة الوجبة علنًا' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'حفظ الوجبة' }));

    expect(mockCreateMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-07-10',
        mealType: 'breakfast',
        mealName: 'الفطور — 10 يوليو 2026',
        isPublic: false,
      }),
      expect.any(Object)
    );
  });
});
