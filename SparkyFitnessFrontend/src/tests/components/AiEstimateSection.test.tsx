import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AiEstimateSection } from '@/components/FoodUnitSelector/AiEstimateSection';

const mockRequestAiUnitConversion = jest.fn();

const mockTranslations: Record<string, string> = {
  'aiEstimate.convertWithAi': 'تقدير التحويل بالذكاء الاصطناعي',
  'aiEstimate.estimating':
    'جاري تقدير {{fromAmount}} {{fromUnit}} بوحدة {{toUnit}}…',
  'aiEstimate.result': 'التقدير: حوالي {{amount}} {{unit}}',
  'aiEstimate.confidenceEstimate': 'تقدير بثقة {{confidence}}',
  'aiEstimate.confidence.medium': 'متوسطة',
  'aiEstimate.useEstimate': 'استخدام التقدير',
  'aiEstimate.editEstimate': 'تعديل يدوي',
  'units.cup': 'كوب',
  'units.gram': 'غ',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const translation = mockTranslations[key] ?? key;
      return translation.replace(/{{(\w+)}}/g, (_, token: string) =>
        String(options?.[token] ?? '')
      );
    },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
  }),
}));

jest.mock('@/hooks/Foods/useAiUnitConversion', () => ({
  useAiUnitConversion:
    () =>
    (...args: unknown[]) =>
      mockRequestAiUnitConversion(...args),
}));

jest.mock('@/utils/logging', () => ({
  error: jest.fn(),
}));

describe('AiEstimateSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the new CTA label and removes the old helper copy', () => {
    render(
      <AiEstimateSection
        food={{ id: 'food-1', name: 'Corn' }}
        fromUnit="cup"
        fromAmount={2}
        toUnit="g"
        knownVariants={[{ amount: 1, unit: 'g' }]}
        onAccept={jest.fn()}
      />
    );

    expect(
      screen.getByRole('button', {
        name: 'تقدير التحويل بالذكاء الاصطناعي',
      })
    ).toBeInTheDocument();
    expect(screen.queryByText(/AI will estimate/i)).not.toBeInTheDocument();
  });

  it('localizes confidence wording in the result state', async () => {
    mockRequestAiUnitConversion.mockResolvedValue({
      estimatedAmount: 125,
      confidence: 'medium',
    });

    render(
      <AiEstimateSection
        food={{ id: 'food-1', name: 'Corn' }}
        fromUnit="cup"
        fromAmount={2}
        toUnit="g"
        knownVariants={[{ amount: 1, unit: 'g' }]}
        onAccept={jest.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'تقدير التحويل بالذكاء الاصطناعي',
      })
    );

    await waitFor(() => {
      expect(screen.getByText('تقدير بثقة متوسطة')).toBeInTheDocument();
    });
  });
});
