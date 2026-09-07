import '@testing-library/jest-dom';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import CustomFoodForm from '@/components/FoodSearch/CustomFoodForm';
import type { Food } from '@/types/food';
import { apiCall } from '@/api/api';
import { renderWithClient } from '../test-utils';

jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));
let mockActiveUserId = 'user-1';
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', activeUserId: mockActiveUserId } }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    nutrientDisplayPreferences: [],
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    aiAssistedConversions: false,
  }),
}));
jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
  useUpdateCustomNutrientMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/hooks/AI/useUserAiConfigAllowed', () => ({
  useUserAiConfigAllowed: () => ({ data: false }),
}));
jest.mock('@/hooks/AI/useAIServiceSettings', () => ({
  useActiveAIService: () => ({ data: undefined }),
}));
jest.mock('@/components/FoodSearch/BarcodeScannerDialog', () => ({
  BarcodeScannerDialog: () => null,
}));
jest.mock('@/components/FoodSearch/VariantCard', () => ({
  VariantCard: () => null,
}));
jest.mock('@/components/FoodSearch/FoodImagePicker', () => ({
  FoodImagePicker: () => null,
}));
jest.mock('@/components/ui/MarkdownEditor', () => ({
  MarkdownEditor: () => null,
}));
const savedFood: Food = {
  id: 'food-1',
  name: 'Cereal',
  user_id: 'user-1',
  is_custom: true,
  barcode: '4008400402222',
};
jest.mock('@/hooks/Foods/useFoodForm', () => ({
  useCustomFoodForm: ({ onSave }: { onSave: (food: Food) => void }) => ({
    formData: {
      name: 'Cereal',
      barcode: '4008400402222',
      brand: '',
      notes: '',
      is_quick_food: false,
    },
    variants: [],
    loadedVariants: [],
    conversionBaseVariants: [],
    imageItems: [],
    variantErrors: [],
    aiEstimatedUnits: [],
    loading: false,
    showSyncConfirmation: false,
    showBarcodeConflictConfirmation: false,
    handleSubmit: (event: React.FormEvent) => {
      event.preventDefault();
      onSave(savedFood);
    },
  }),
}));

describe('custom food manual contribution entry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveUserId = 'user-1';
    jest.mocked(apiCall).mockResolvedValue({
      serverEnabled: true,
      userEnabled: false,
      productLanguage: 'de',
      providerScope: 'personal',
      status: { pending: 0, processing: 0, failed: 0, succeeded: 0 },
      recentFailures: [],
    });
  });

  it('normal save completes locally without opening a preview or publishing', async () => {
    const onSave = jest.fn();
    renderWithClient(<CustomFoodForm onSave={onSave} />);
    await screen.findByRole('button', {
      name: 'Save and preview contribution',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Food' }));
    expect(onSave).toHaveBeenCalledWith(savedFood);
    expect(
      screen.queryByLabelText('Your own product photo')
    ).not.toBeInTheDocument();
    expect(
      jest
        .mocked(apiCall)
        .mock.calls.every(([, options]) => options?.method === 'GET')
    ).toBe(true);
  });

  it.each([false, true])(
    'saves locally before opening optional contribution and finishes the original callback on cancel (edit=%s)',
    async (editing) => {
      const onSave = jest.fn();
      renderWithClient(
        <CustomFoodForm
          onSave={onSave}
          food={editing ? savedFood : undefined}
        />
      );
      fireEvent.click(
        await screen.findByRole('button', {
          name: 'Save and preview contribution',
        })
      );
      expect(
        await screen.findByLabelText('Your own product photo')
      ).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith(savedFood);
      expect(
        jest
          .mocked(apiCall)
          .mock.calls.every(([, options]) => options?.method === 'GET')
      ).toBe(true);
    }
  );

  it.each([
    ['delegate', undefined, 'another-user'],
    [
      'imported food',
      { ...savedFood, provider_type: 'openfoodfacts' as const },
      'user-1',
    ],
  ])(
    'does not offer public contributions for a %s',
    async (_name, food, activeUser) => {
      mockActiveUserId = activeUser;
      renderWithClient(<CustomFoodForm onSave={jest.fn()} food={food} />);
      await waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: food ? 'Update Food' : 'Add Food',
          })
        ).toBeInTheDocument()
      );
      expect(
        screen.queryByRole('button', { name: 'Save and preview contribution' })
      ).not.toBeInTheDocument();
    }
  );
});
