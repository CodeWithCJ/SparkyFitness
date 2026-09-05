import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import WaterContainerManager from '@/pages/Settings/WaterContainerManager';
import type { WaterContainer } from '@/types/settings';
import { renderWithClient } from '../test-utils';

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockSetPrimary = jest.fn();

const mockContainers: WaterContainer[] = [
  {
    id: 1,
    user_id: 'user-1',
    name: 'Bottle',
    volume: 500,
    unit: 'ml',
    is_primary: true,
    servings_per_container: 1,
    hydration_factor: 1.0,
  },
  {
    id: 2,
    user_id: 'user-1',
    name: 'Tea Mug',
    volume: 250,
    unit: 'ml',
    is_primary: false,
    servings_per_container: 1,
    hydration_factor: 0.9,
    linked_food_id: 'food-123',
    linked_food_name: 'Green Tea',
    linked_variant_serving_size: 1,
    linked_variant_serving_unit: 'cup',
    linked_meal_type_name: 'Breakfast',
  },
];

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown) =>
      typeof second === 'string'
        ? second
        : ((second as { defaultValue?: string })?.defaultValue ?? key),
    i18n: {
      language: 'en',
      changeLanguage: jest.fn(),
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

jest.mock('@/hooks/Foods/useFoods', () => ({
  foodViewOptions: (id: string) => ({
    queryKey: ['food', id],
    queryFn: () =>
      Promise.resolve({
        id,
        name: 'Mock Black Coffee',
        is_custom: false,
        variants: [
          {
            id: 'mock-var-1',
            serving_size: 1,
            serving_unit: 'cup',
            calories: 5,
            protein: 0,
            carbs: 0,
            fat: 0,
            is_default: true,
          },
        ],
      }),
  }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', activeUserId: 'user-1' } }),
}));

jest.mock('@/hooks/Settings/useWaterContainers', () => ({
  useWaterContainersQuery: () => ({ data: mockContainers }),
  useCreateWaterContainerMutation: () => ({ mutateAsync: mockCreate }),
  useUpdateWaterContainerMutation: () => ({ mutateAsync: mockUpdate }),
  useDeleteWaterContainerMutation: () => ({ mutateAsync: mockDelete }),
  useSetPrimaryWaterContainerMutation: () => ({ mutateAsync: mockSetPrimary }),
}));

jest.mock('@/hooks/Diary/useMealTypes', () => ({
  useMealTypes: () => ({
    data: [
      { id: 'mt-1', name: 'Breakfast' },
      { id: 'mt-2', name: 'Snacks' },
    ],
  }),
}));

jest.mock('@/components/FoodSearch/FoodSearchDialog', () => {
  return function MockFoodSearchDialog({
    open,
    onFoodSelect,
  }: {
    open: boolean;
    onFoodSelect: (item: { id: string; name: string }, type: string) => void;
  }) {
    if (!open) return null;
    return (
      <div data-testid="food-search-dialog">
        <button
          onClick={() =>
            onFoodSelect(
              { id: 'mock-food-id', name: 'Mock Black Coffee' },
              'food'
            )
          }
        >
          Select Coffee
        </button>
      </div>
    );
  };
});

describe('WaterContainerManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders container list and displays linked food badge and hydration factor', () => {
    renderWithClient(<WaterContainerManager />);

    expect(screen.getByText('Manage Water Containers')).toBeInTheDocument();
    expect(screen.getByText(/Bottle/)).toBeInTheDocument();
    expect(screen.getByText(/Tea Mug/)).toBeInTheDocument();

    // Verify linked food pill
    expect(screen.getByText(/Linked Food: Green Tea/)).toBeInTheDocument();
    expect(screen.getByText(/Hydration Factor: 0.9x/)).toBeInTheDocument();
  });

  it('submits a new container with hydration factor', async () => {
    renderWithClient(<WaterContainerManager />);

    const nameInput = screen.getByLabelText('Container Name');
    const volumeInput = screen.getByLabelText('Volume');
    const servingsInput = screen.getByLabelText('Servings per Container');
    const hydrationInput = screen.getByLabelText('Hydration Factor');

    fireEvent.change(nameInput, { target: { value: 'Espresso Cup' } });
    fireEvent.change(volumeInput, { target: { value: '60' } });
    fireEvent.change(servingsInput, { target: { value: '1' } });
    fireEvent.change(hydrationInput, { target: { value: '0.8' } });

    const submitBtn = screen.getByText('Add Container');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Espresso Cup',
          volume: 60,
          servings_per_container: 1,
          hydration_factor: 0.8,
        })
      );
    });
  });

  it('allows linking a food item in the add form', async () => {
    renderWithClient(<WaterContainerManager />);

    const linkFoodBtn = screen.getByText('Link to Food Item');
    fireEvent.click(linkFoodBtn);

    // Food search dialog opens
    const selectCoffeeBtn = screen.getByText('Select Coffee');
    fireEvent.click(selectCoffeeBtn);

    // Food is now linked
    await waitFor(() => {
      expect(screen.getByText('Mock Black Coffee')).toBeInTheDocument();
    });
  });
});
