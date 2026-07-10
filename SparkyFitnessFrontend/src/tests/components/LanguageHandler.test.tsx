import { render } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import LanguageHandler from '@/components/LanguageHandler';

jest.mock('react-i18next', () => ({
  useTranslation: jest.fn(),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: jest.fn(),
}));

const mockUseTranslation = jest.mocked(useTranslation);
const mockUsePreferences = jest.mocked(usePreferences);
const changeLanguage = jest.fn().mockResolvedValue(undefined);

describe('LanguageHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    mockUseTranslation.mockReturnValue({
      i18n: { changeLanguage },
    } as unknown as ReturnType<typeof useTranslation>);
  });

  it('applies Saudi Arabic language metadata and RTL direction', () => {
    mockUsePreferences.mockReturnValue({
      language: 'ar',
    } as ReturnType<typeof usePreferences>);

    render(<LanguageHandler />);

    expect(changeLanguage).toHaveBeenCalledWith('ar');
    expect(document.documentElement.lang).toBe('ar-SA');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('returns the document to LTR when the explicit language changes', () => {
    mockUsePreferences.mockReturnValue({
      language: 'ar',
    } as ReturnType<typeof usePreferences>);
    const { rerender } = render(<LanguageHandler />);

    mockUsePreferences.mockReturnValue({
      language: 'en',
    } as ReturnType<typeof usePreferences>);
    rerender(<LanguageHandler />);

    expect(changeLanguage).toHaveBeenLastCalledWith('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
