import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getRecipeSource } from '@/api/Foods/recipeImportService';
import RecipeImportSourcePanel from '@/pages/Foods/RecipeImportSourcePanel';

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'owner', isActingOnBehalf: false }),
}));
jest.mock('@/utils/userPreferences', () => ({
  getUserLoggingLevel: () => 'ERROR',
}));
jest.mock('@/utils/logging', () => ({
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

it('handles the real suppressed-404 response before parsing and settles the ordinary-meal panel without an error or sync', async () => {
  const originalFetch = global.fetch;
  const fetchMock = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'No source' }),
    } as Response);
  global.fetch = fetchMock;
  try {
    await expect(getRecipeSource('ordinary')).resolves.toBeNull();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <RecipeImportSourcePanel mealId="ordinary" />
      </QueryClientProvider>
    );
    await waitFor(() =>
      expect(
        client.getQueryState([
          'meals',
          'recipe-import-source',
          'owner',
          'ordinary',
        ])?.status
      ).toBe('success')
    );
    expect(client.isFetching()).toBe(0);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sync nutrition to Mealie' })
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v2/recipe-imports/ordinary/source',
      expect.objectContaining({ suppress404Toast: true })
    );
  } finally {
    global.fetch = originalFetch;
  }
});
