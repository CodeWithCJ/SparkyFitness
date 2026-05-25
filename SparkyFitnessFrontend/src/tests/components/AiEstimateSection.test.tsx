import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AiEstimateSection } from '@/components/FoodUnitSelector/AiEstimateSection';

const mockRequestAiUnitConversion = jest.fn();

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
  }),
}));

jest.mock('@/api/AiConversions/aiConversionApi', () => ({
  requestAiUnitConversion: (...args: unknown[]) =>
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
      screen.getByRole('button', { name: /Convert with AI/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/AI will estimate/i)).not.toBeInTheDocument();
  });

  it('uses Good/Fair/Rough confidence wording in the result state', async () => {
    mockRequestAiUnitConversion.mockResolvedValue({
      estimatedAmount: 125,
      confidence: 'medium',
      reasoning: 'Typical density estimate.',
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

    fireEvent.click(screen.getByRole('button', { name: /Convert with AI/i }));

    await waitFor(() => {
      expect(screen.getByText(/Fair estimate/i)).toBeInTheDocument();
    });
  });
});
