import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AllergenBadges from '@/components/AllergenBadges';

jest.mock('@/hooks/useAllergenPreferences', () => ({
  useAllergenPreferences: () => ({
    data: [{ allergen_name: 'milk' }, { allergen_name: 'sesame' }],
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'foodVariant.allergens.milk': 'الحليب',
        'foodVariant.allergens.sesame': 'السمسم',
        'foodResultCard.traceAllergen': 'آثار {{allergen}}',
      };
      return (
        translations[key] ?? String(options?.defaultValue ?? key)
      ).replace(/{{(\w+)}}/g, (_, token: string) =>
        String(options?.[token] ?? '')
      );
    },
  }),
}));

describe('AllergenBadges', () => {
  it('localizes direct allergen and trace warnings', () => {
    render(<AllergenBadges allergens={['milk']} traces={['sesame']} />);

    expect(screen.getByText('⚠ الحليب')).toBeInTheDocument();
    expect(screen.getByText('آثار السمسم')).toBeInTheDocument();
  });
});
