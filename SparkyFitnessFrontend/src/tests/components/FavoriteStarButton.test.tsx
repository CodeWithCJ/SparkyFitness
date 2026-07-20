import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FavoriteStarButton from '@/components/FavoriteStarButton';
import {
  useFavoritesQuery,
  useToggleFavoriteMutation,
} from '@/hooks/Foods/useFavorites';

jest.mock('@/hooks/Foods/useFavorites', () => ({
  useFavoritesQuery: jest.fn(),
  useToggleFavoriteMutation: jest.fn(),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: string) => d ?? _k }),
}));

const mockQuery = useFavoritesQuery as jest.MockedFunction<
  typeof useFavoritesQuery
>;
const mockToggle = useToggleFavoriteMutation as jest.MockedFunction<
  typeof useToggleFavoriteMutation
>;

describe('FavoriteStarButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToggle.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    } as never);
  });

  // Regression: while favorites load, isFavorite defaults to false, so an early
  // tap would fire a toggle against unknown state. The button must be disabled.
  it('is disabled while the favorites query is loading', () => {
    mockQuery.mockReturnValue({ data: undefined, isLoading: true } as never);

    render(<FavoriteStarButton type="food" id="food-1" />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('is enabled once favorites have loaded', () => {
    mockQuery.mockReturnValue({
      data: { favoriteFoods: [], favoriteMeals: [] },
      isLoading: false,
    } as never);

    render(<FavoriteStarButton type="food" id="food-1" />);

    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
