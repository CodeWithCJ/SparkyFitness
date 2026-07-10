import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CopyFamilyEntryDialog from '@/pages/Diary/CopyFamilyEntryDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => {
      const translations: Record<string, string> = {
        'diary.copyFamilyTitle': 'نسخ الوجبات مع العائلة',
        'diary.copyFamilyDesc':
          'انسخ سجلات الأكل بين يومياتك ويوميات أفراد عائلتك المصرّح لهم.',
        'diary.copyFamilyNoConnections': 'ما عندك مشاركة عائلية مؤهلة للحين',
        'diary.copyFamilyNoConnectionsHelp':
          'لازم فرد العائلة يعطيك صلاحية إدارة اليوميات واستخدام مكتبة الأطعمة والوجبات.',
        'common.cancel': 'إلغاء',
      };

      return translations[key] ?? defaultValue ?? key;
    },
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { activeUserId: 'user-1' } }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ accessibleUsers: [] }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDate: () => '10 يوليو 2026',
    formatDateInUserTimezone: () => '2026-07-10',
    loggingLevel: 'ERROR',
  }),
}));

jest.mock('@/hooks/Settings/useFamilyAccess', () => ({
  useFamilyAccess: () => ({ data: [] }),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({ data: [], isLoading: false }),
}));

jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useCopyFoodEntriesFromUserMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useCopyFoodEntriesToUserMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

describe('CopyFamilyEntryDialog', () => {
  it('explains family sharing requirements in natural Arabic', () => {
    render(
      <CopyFamilyEntryDialog
        isOpen
        onClose={jest.fn()}
        sourceMealType="lunch"
        currentDate="2026-07-10"
      />
    );

    expect(screen.getByText('نسخ الوجبات مع العائلة')).toBeInTheDocument();
    expect(
      screen.getByText(
        'انسخ سجلات الأكل بين يومياتك ويوميات أفراد عائلتك المصرّح لهم.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('ما عندك مشاركة عائلية مؤهلة للحين')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'لازم فرد العائلة يعطيك صلاحية إدارة اليوميات واستخدام مكتبة الأطعمة والوجبات.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
  });
});
