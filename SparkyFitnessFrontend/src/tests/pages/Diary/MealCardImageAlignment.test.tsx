import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import MealCard from '@/pages/Diary/MealCard';
import type { FoodEntry } from '@/types/food';

const mockEmpty: never[] = [];

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    nutrientDisplayPreferences: mockEmpty,
    loggingLevel: 'ERROR',
    getDateRelationToToday: () => 'today',
    timeFormat: '24h',
  }),
}));
jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useCopyFoodEntriesFromYesterdayMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/components/AllergenBadges', () => ({
  __esModule: true,
  default: () => null,
}));
const mockOpenLightbox = jest.fn();
jest.mock('@/hooks/Foods/useImageLightbox', () => ({
  useImageLightbox: () => ({
    lightboxProps: {
      images: [],
      initialIndex: 0,
      open: false,
      onOpenChange: () => undefined,
    },
    openLightbox: mockOpenLightbox,
  }),
}));
jest.mock('@/components/FoodSearch/FoodSearch', () => ({
  __esModule: true,
  default: () => null,
}));

const totals = {
  calories: 100,
  protein: 1,
  carbs: 1,
  fat: 1,
  dietary_fiber: 1,
};

const entry = (id: string, images: string[] | null): FoodEntry =>
  ({
    id,
    food_name: `Food ${id}`,
    meal_type: 'breakfast',
    entry_date: '2026-11-17',
    quantity: 1,
    unit: 'serving',
    images,
  }) as FoodEntry;

// The placeholder for a row without a usable image: the dimmed food icon on a
// muted tile, hidden from assistive tech and not interactive.
const expectPlaceholder = (placeholder: HTMLElement) => {
  expect(placeholder).toHaveAttribute('aria-hidden', 'true');
  expect(placeholder).toHaveClass(
    'hidden',
    'sm:flex',
    'w-16',
    'h-16',
    'flex-shrink-0',
    'rounded-md',
    'bg-gray-100',
    'dark:bg-gray-700'
  );
  const icon = placeholder.querySelector('svg.lucide-utensils-crossed');
  expect(icon).not.toBeNull();
  expect(icon).toHaveClass('h-6', 'w-6', 'text-muted-foreground');
  expect(within(placeholder).queryByRole('button')).toBeNull();
};

const mealCard = (entries: FoodEntry[], client: QueryClient) => {
  const props: ComponentProps<typeof MealCard> = {
    meal: {
      name: 'Breakfast',
      type: 'breakfast',
      entries,
      selectedDate: '2026-11-17',
    },
    totals,
    selectedDate: '2026-11-17',
    onFoodSelect: jest.fn(),
    onEditEntry: jest.fn(),
    onRemoveEntry: jest.fn(),
    getEntryNutrition: () => totals,
    onCopyClick: jest.fn(),
    onCopyFamilyClick: jest.fn(),
    onConvertToMealClick: jest.fn(),
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
  };
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MealCard {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const renderMeal = (entries: FoodEntry[]) => {
  const client = new QueryClient();
  const { rerender } = render(mealCard(entries, client));
  return {
    rerenderMeal: (next: FoodEntry[]) => rerender(mealCard(next, client)),
  };
};

describe('MealCard desktop image alignment', () => {
  beforeEach(() => mockOpenLightbox.mockClear());

  it('gives rows without an image a placeholder when another row has one', () => {
    renderMeal([
      entry('a', ['https://example.com/a.jpg']),
      entry('b', null),
      entry('c', []),
    ]);

    const placeholders = screen.getAllByTestId('meal-entry-image-placeholder');
    expect(placeholders).toHaveLength(2);
    for (const placeholder of placeholders) {
      expectPlaceholder(placeholder);
    }
  });

  it('adds no placeholder to a meal without images', () => {
    renderMeal([entry('a', null), entry('b', [])]);

    expect(
      screen.queryByTestId('meal-entry-image-placeholder')
    ).not.toBeInTheDocument();
  });

  it('turns a single image that fails to load into the placeholder', () => {
    renderMeal([entry('a', ['https://example.com/a.jpg']), entry('b', null)]);

    expect(screen.getAllByTestId('meal-entry-image-placeholder')).toHaveLength(
      1
    );
    fireEvent.error(screen.getByRole('img', { name: 'Food a' }));

    expect(screen.queryByRole('img', { name: 'Food a' })).toBeNull();
    // The lightbox button is gone, so it can no longer be clicked or focused.
    expect(
      screen.queryByRole('button', { name: 'View images' })
    ).not.toBeInTheDocument();
    const placeholders = screen.getAllByTestId('meal-entry-image-placeholder');
    expect(placeholders).toHaveLength(2);
    placeholders.forEach(expectPlaceholder);
  });

  it('shows the next image when the first fails, and keeps the lightbox', () => {
    renderMeal([
      entry('a', [
        'https://example.com/dead.jpg',
        'https://example.com/b.jpg',
        'https://example.com/c.jpg',
      ]),
    ]);

    fireEvent.error(screen.getByRole('img', { name: 'Food a' }));

    expect(screen.getByRole('img', { name: 'Food a' })).toHaveAttribute(
      'src',
      'https://example.com/b.jpg'
    );
    expect(
      screen.queryByTestId('meal-entry-image-placeholder')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View images' }));
    // Opens on the image shown, without the one that failed.
    expect(mockOpenLightbox).toHaveBeenCalledWith(
      ['https://example.com/b.jpg', 'https://example.com/c.jpg'],
      0,
      'Food a'
    );
  });

  it('moves past a repeated dead address to the next image', () => {
    const dead = 'https://example.com/dead.jpg';
    renderMeal([entry('a', [dead, dead, 'https://example.com/ok.jpg'])]);

    const first = screen.getByRole('img', { name: 'Food a' });
    fireEvent.error(first);
    // The same address again is a new element, so the browser loads it
    // afresh and can report its own error.
    const second = screen.getByRole('img', { name: 'Food a' });
    expect(second).not.toBe(first);
    expect(second).toHaveAttribute('src', dead);
    fireEvent.error(second);

    expect(screen.getByRole('img', { name: 'Food a' })).toHaveAttribute(
      'src',
      'https://example.com/ok.jpg'
    );
    expect(
      screen.getByRole('button', { name: 'View images' })
    ).toBeInTheDocument();
  });

  it('shows the placeholder when the same dead address repeats', () => {
    const dead = 'https://example.com/dead.jpg';
    renderMeal([entry('a', [dead, dead])]);

    fireEvent.error(screen.getByRole('img', { name: 'Food a' }));
    fireEvent.error(screen.getByRole('img', { name: 'Food a' }));

    expect(screen.queryByRole('img', { name: 'Food a' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'View images' })
    ).not.toBeInTheDocument();
    expectPlaceholder(screen.getByTestId('meal-entry-image-placeholder'));
  });

  it('shows the placeholder once every image has failed', () => {
    renderMeal([
      entry('a', ['https://example.com/x.jpg', 'https://example.com/y.jpg']),
    ]);

    fireEvent.error(screen.getByRole('img', { name: 'Food a' }));
    fireEvent.error(screen.getByRole('img', { name: 'Food a' }));

    expect(screen.queryByRole('img', { name: 'Food a' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'View images' })
    ).not.toBeInTheDocument();
    expectPlaceholder(screen.getByTestId('meal-entry-image-placeholder'));
  });

  it('tries again from the first image when the addresses change', () => {
    const { rerenderMeal } = renderMeal([
      entry('a', ['https://example.com/x.jpg']),
    ]);
    fireEvent.error(screen.getByRole('img', { name: 'Food a' }));
    expect(screen.queryByRole('img', { name: 'Food a' })).toBeNull();

    rerenderMeal([entry('a', ['https://example.com/new.jpg'])]);

    expect(screen.getByRole('img', { name: 'Food a' })).toHaveAttribute(
      'src',
      'https://example.com/new.jpg'
    );
  });
});
