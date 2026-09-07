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
    linked_quantity: 240,
    linked_variant_serving_size: 240,
    linked_variant_serving_unit: 'ml',
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

const mockMaterializePreset = jest.fn();

jest.mock('@/hooks/Settings/useWaterContainers', () => ({
  useWaterContainersQuery: () => ({ data: mockContainers }),
  useCreateWaterContainerMutation: () => ({ mutateAsync: mockCreate }),
  useUpdateWaterContainerMutation: () => ({ mutateAsync: mockUpdate }),
  useDeleteWaterContainerMutation: () => ({ mutateAsync: mockDelete }),
  useSetPrimaryWaterContainerMutation: () => ({ mutateAsync: mockSetPrimary }),
  useDrinkPresetCatalogQuery: () => ({
    data: [
      {
        id: 'espresso',
        displayNameKey: 'drink_presets.espresso',
        defaultName: 'Espresso',
        volumeMl: 30,
        servingUnit: 'ml',
        caffeineMg: 63,
        hydrationFactor: 0,
        kind: 'caffeine',
      },
    ],
  }),
  useMaterializeDrinkPresetMutation: () => ({
    mutateAsync: mockMaterializePreset,
    isPending: false,
  }),
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

// The container form asks for quantity and unit with the diary's own picker,
// so the test stands in for it and confirms a 250 ml choice.
jest.mock('@/components/FoodUnitSelector', () => {
  return function MockFoodUnitSelector({
    open,
    food,
    onSelect,
  }: {
    open: boolean;
    food: { id: string; name: string };
    onSelect: (
      food: { id: string; name: string },
      quantity: number,
      unit: string,
      variant: { id: string; serving_size: number; serving_unit: string }
    ) => void;
  }) {
    if (!open) return null;
    return (
      <div data-testid="food-unit-selector">
        <button
          onClick={() =>
            onSelect(food, 250, 'ml', {
              id: 'mock-var-ml',
              serving_size: 250,
              serving_unit: 'ml',
            })
          }
        >
          Confirm 250 ml
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

    // Linking lives on its own tab now, so the plain-water fields and the
    // food fields can never both be on screen at once.
    // Radix tabs activate on mousedown, not click.
    fireEvent.mouseDown(screen.getByText('Drink (linked food)'));

    const linkFoodBtn = screen.getByText('Link to Food Item');
    fireEvent.click(linkFoodBtn);

    // Food search dialog opens
    const selectCoffeeBtn = screen.getByText('Select Coffee');
    fireEvent.click(selectCoffeeBtn);

    // The diary picker takes over for quantity and unit
    const confirmBtn = await screen.findByText('Confirm 250 ml');
    fireEvent.click(confirmBtn);

    // Food is now linked, and the press logs what the picker returned
    await waitFor(() => {
      expect(screen.getByText('Mock Black Coffee')).toBeInTheDocument();
    });
    expect(screen.getByText('250 ml')).toBeInTheDocument();
  });

  it('opens catalog dialog and adds a drink preset', async () => {
    renderWithClient(<WaterContainerManager />);

    const addCatalogButtons = screen.getAllByText('Add from Catalog');
    fireEvent.click(addCatalogButtons[0]!);

    expect(screen.getByText('Drink Preset Catalog')).toBeInTheDocument();
    expect(screen.getByText('Espresso')).toBeInTheDocument();

    const addPresetBtn = screen.getByText('Add Preset');
    fireEvent.click(addPresetBtn);

    await waitFor(() => {
      expect(mockMaterializePreset).toHaveBeenCalledWith('espresso');
    });
  });

  // A linked container carries volume 0 on purpose -- its amount lives on the
  // food -- so printing the volume column showed every drink preset as
  // "Double Espresso - 0 ml".
  it('describes a linked container by what one press logs, not by its empty volume', () => {
    renderWithClient(<WaterContainerManager />);

    expect(screen.getByText(/Tea Mug - 240 ml/)).toBeInTheDocument();
    expect(screen.queryByText(/Tea Mug - 0/)).not.toBeInTheDocument();
    // Servings divide a plain container's volume; they mean nothing here.
    expect(screen.getByText(/Tea Mug/).textContent).not.toMatch(/serving/);
  });

  it('still shows volume and servings for a plain container', () => {
    renderWithClient(<WaterContainerManager />);
    expect(screen.getByText(/Bottle - 500 ml/)).toBeInTheDocument();
  });
});
