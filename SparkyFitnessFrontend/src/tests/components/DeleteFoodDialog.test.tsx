import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import DeleteFoodDialog from '@/pages/Foods/DeleteFoodDialog';
import type { Food } from '@/types/food';

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
        'foodDatabaseManager.deleteFoodConfirmTitle': 'تحذف {{foodName}}؟',
        'foodDatabaseManager.foodUsedIn': 'هالطعام مستخدم في:',
        'foodDatabaseManager.diaryEntries': '{{count}} من تسجيلات اليوميات',
        'foodDatabaseManager.viewDiaryEntry': 'عرض التسجيل',
        'foodDatabaseManager.otherUser': 'مستخدم آخر',
        'foodDatabaseManager.cancel': 'إلغاء',
        'foodDatabaseManager.hide': 'إخفاء',
        'foodDatabaseManager.forceDelete': 'حذف نهائي',
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
    formatDateInUserTimezone: () => '١٠ يوليو ٢٠٢٦',
  }),
}));

const food = {
  id: 'food-1',
  name: 'كبسة دجاج',
} as Food;

describe('DeleteFoodDialog', () => {
  it('localizes diary references and destructive actions', () => {
    const onConfirm = jest.fn();

    render(
      <MemoryRouter>
        <DeleteFoodDialog
          pendingDeletion={{
            food,
            impact: {
              foodEntries: [
                {
                  id: 'entry-1',
                  entry_date: '2026-07-10',
                  meal_type_id: 'dinner',
                  isCurrentUser: true,
                },
              ],
              foodEntriesCount: 1,
              mealFoodsCount: 0,
              mealPlansCount: 1,
              mealPlanTemplateAssignmentsCount: 0,
              currentUserReferences: 2,
              otherUserReferences: 0,
              totalReferences: 2,
              isPubliclyShared: false,
              familySharedUsers: [],
            },
          }}
          mealTypes={[{ id: 'dinner', name: 'العشاء' }]}
          onConfirm={onConfirm}
          onCancel={jest.fn()}
        />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('dialog', { name: 'تحذف كبسة دجاج؟' })
    ).toBeInTheDocument();
    expect(screen.getByText('١٠ يوليو ٢٠٢٦')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'عرض التسجيل' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'حذف نهائي' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إخفاء' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
});
