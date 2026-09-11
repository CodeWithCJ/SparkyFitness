import '@testing-library/jest-dom';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { apiCall } from '@/api/api';
import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { openFoodFactsContributionKeys } from '@/api/keys/settings';
import OpenFoodFactsContributionDialog from '@/pages/Foods/OpenFoodFactsContributionDialog';
import { prepareOpenFoodFactsImage } from '@/utils/openFoodFactsContribution';
import type { Food } from '@/types/food';
import { renderWithClient } from '../test-utils';

jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
jest.mock('@/utils/openFoodFactsContribution', () => ({
  ...jest.requireActual('@/utils/openFoodFactsContribution'),
  prepareOpenFoodFactsImage: jest.fn(),
}));
let mockUser = { id: 'user-1', activeUserId: 'user-1' };
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser }) }));

const food: Food = {
  id: 'food-1',
  name: 'Cereal',
  is_custom: true,
  user_id: 'user-1',
  barcode: '4008400402222',
};
const settings = {
  serverEnabled: true,
  userEnabled: false,
  productLanguage: 'de',
  providerScope: 'personal',
  status: { pending: 0, processing: 0, failed: 0, succeeded: 0 },
  recentFailures: [],
};
const preview = {
  previewToken: 'signed-preview-token',
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  productUrl: 'https://world.openfoodfacts.net/product/4008400402222',
  providerScope: 'personal',
  fields: {
    code: '4008400402222',
    product_name_de: 'Cereal',
    nutriment_proteins: '7.25',
    app_uuid: 'public-anonymous-attribution',
  },
  imageBase64: 'c2FuaXRpemVk',
  imageType: 'nutrition',
  existingProduct: true,
};
const onOpenChange = jest.fn();

const confirmCalls = () =>
  jest
    .mocked(apiCall)
    .mock.calls.filter(([endpoint]) => endpoint.endsWith('/contribute'));

async function selectPhoto() {
  fireEvent.change(await screen.findByLabelText('Your own product photo'), {
    target: {
      files: [new File(['photo'], 'nutrition.jpg', { type: 'image/jpeg' })],
    },
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Preview contribution' })
    ).toBeEnabled()
  );
}

async function openPreview() {
  await selectPhoto();
  fireEvent.click(screen.getByRole('button', { name: 'Preview contribution' }));
  await screen.findByRole('heading', {
    name: 'Review this exact contribution',
  });
}

function approveBoth() {
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: /entered these data from the physical packaging/,
    })
  );
  fireEvent.click(screen.getByRole('checkbox', { name: /took this photo/ }));
}

function renderWithMutableSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(openFoodFactsContributionKeys.user(), settings);
  const view = render(
    <OpenFoodFactsContributionDialog
      open
      food={food}
      onOpenChange={onOpenChange}
    />,
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    }
  );
  return { ...view, queryClient };
}

const revokeAvailability = (queryClient: QueryClient) => {
  queryClient.setQueryData(openFoodFactsContributionKeys.user(), {
    ...settings,
    serverEnabled: false,
    providerScope: null,
  });
};

describe('manual Open Food Facts preview and confirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1', activeUserId: 'user-1' };
    jest.mocked(prepareOpenFoodFactsImage).mockResolvedValue('b3JpZ2luYWw=');
    jest.mocked(apiCall).mockImplementation(async (endpoint) => {
      if (endpoint.endsWith('/preview')) return preview;
      if (endpoint.endsWith('/contribute'))
        return {
          status: 'success',
          message: 'Published.',
          productUrl: preview.productUrl,
          providerScope: 'personal',
        };
      return settings;
    });
  });

  it('opening, selecting, previewing and cancelling never publish', async () => {
    renderWithClient(
      <OpenFoodFactsContributionDialog
        open
        food={food}
        onOpenChange={onOpenChange}
      />
    );
    expect(confirmCalls()).toHaveLength(0);
    await openPreview();
    expect(apiCall).toHaveBeenCalledWith(
      '/v2/foods/food-1/openfoodfacts/preview',
      {
        method: 'POST',
        body: {
          productLanguage: 'de',
          imageType: 'nutrition',
          imageBase64: 'b3JpZ2luYWw=',
        },
      }
    );
    expect(
      screen.getByRole('img', { name: 'Photo to publish' })
    ).toHaveAttribute('src', 'data:image/jpeg;base64,c2FuaXRpemVk');
    expect(
      screen.getByRole('link', { name: preview.productUrl })
    ).toHaveAttribute('href', preview.productUrl);
    expect(
      screen.getByText('Your personal Open Food Facts account')
    ).toBeInTheDocument();
    for (const [key, value] of Object.entries(preview.fields)) {
      expect(screen.getByRole('cell', { name: key })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: value })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(confirmCalls()).toHaveLength(0);
  });

  it('requires two fresh approvals and publishes only the sanitized, signed preview', async () => {
    renderWithClient(
      <OpenFoodFactsContributionDialog
        open
        food={food}
        onOpenChange={onOpenChange}
      />
    );
    await openPreview();
    const publish = screen.getByRole('button', {
      name: 'Publish this contribution',
    });
    expect(publish).toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /entered these data from the physical packaging/,
      })
    );
    expect(publish).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /took this photo/ }));
    fireEvent.click(publish);
    await screen.findByText('Published.');
    expect(confirmCalls()).toEqual([
      [
        '/v2/foods/food-1/openfoodfacts/contribute',
        {
          method: 'POST',
          body: {
            productLanguage: 'de',
            imageType: 'nutrition',
            imageBase64: 'c2FuaXRpemVk',
            previewToken: 'signed-preview-token',
            confirm: true,
            confirmImageRights: true,
          },
        },
      ],
    ]);
    expect(
      screen.queryByRole('button', { name: 'Publish this contribution' })
    ).not.toBeInTheDocument();
  });

  it.each(['language', 'photo', 'image type'])(
    'invalidates the preview and approvals when changing %s',
    async (field) => {
      renderWithClient(
        <OpenFoodFactsContributionDialog
          open
          food={food}
          onOpenChange={onOpenChange}
        />
      );
      await openPreview();
      approveBoth();
      if (field === 'language')
        fireEvent.change(
          screen.getByRole('textbox', { name: 'Product data language' }),
          { target: { value: 'fr' } }
        );
      if (field === 'photo') await selectPhoto();
      if (field === 'image type')
        fireEvent.change(
          screen.getByRole('combobox', { name: 'Photo content' }),
          { target: { value: 'front' } }
        );
      expect(
        screen.queryByRole('button', { name: 'Publish this contribution' })
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Preview contribution' })
      );
      await screen.findByRole('button', { name: 'Publish this contribution' });
      expect(
        screen.getByRole('button', { name: 'Publish this contribution' })
      ).toBeDisabled();
      expect(confirmCalls()).toHaveLength(0);
    }
  );

  it('reports an ambiguous data-write outcome without claiming failure or retrying', async () => {
    jest.mocked(apiCall).mockImplementation(async (endpoint) => {
      if (endpoint.endsWith('/preview')) return preview;
      if (endpoint.endsWith('/contribute'))
        return {
          status: 'partial',
          message:
            'The photo was published, but the product data response timed out. Check the public product before trying again.',
          productUrl: preview.productUrl,
          providerScope: 'personal',
        };
      return settings;
    });
    renderWithClient(
      <OpenFoodFactsContributionDialog
        open
        food={food}
        onOpenChange={onOpenChange}
      />
    );
    await openPreview();
    approveBoth();
    fireEvent.click(
      screen.getByRole('button', { name: 'Publish this contribution' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Photo published; product data unconfirmed'
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The photo was published, but the product data response timed out. Check the public product before trying again.'
    );
    expect(
      screen.getByRole('link', { name: preview.productUrl })
    ).toHaveAttribute('href', preview.productUrl);
    expect(
      screen.queryByText(/product data not saved/i)
    ).not.toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Publish this contribution' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Preview contribution' })
    ).not.toBeInTheDocument();
    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    expect(confirmCalls()).toHaveLength(1);
  });

  it('discards a failed confirmation and requires a new preview without retrying the write', async () => {
    jest.mocked(apiCall).mockImplementation(async (endpoint) => {
      if (endpoint.endsWith('/preview')) return preview;
      if (endpoint.endsWith('/contribute'))
        throw new Error('The product changed; request a new preview.');
      return settings;
    });
    renderWithClient(
      <OpenFoodFactsContributionDialog
        open
        food={food}
        onOpenChange={onOpenChange}
      />
    );
    await openPreview();
    approveBoth();
    fireEvent.click(
      screen.getByRole('button', { name: 'Publish this contribution' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The product changed; request a new preview.'
    );
    expect(confirmCalls()).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'Publish this contribution' })
    ).not.toBeInTheDocument();
  });

  it('keeps the in-progress publication result visible when close is clicked', async () => {
    let complete: ((result: unknown) => void) | undefined;
    const pending = new Promise<unknown>((resolve) => {
      complete = resolve;
    });
    jest.mocked(apiCall).mockImplementation(async (endpoint) => {
      if (endpoint.endsWith('/preview')) return preview;
      if (endpoint.endsWith('/contribute')) return pending;
      return settings;
    });
    renderWithClient(
      <OpenFoodFactsContributionDialog
        open
        food={food}
        onOpenChange={onOpenChange}
      />
    );
    await openPreview();
    approveBoth();
    fireEvent.click(
      screen.getByRole('button', { name: 'Publish this contribution' })
    );
    await screen.findByRole('button', { name: 'Publishing…' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () =>
      complete?.({
        status: 'success',
        message: 'Published.',
        productUrl: preview.productUrl,
        providerScope: 'personal',
      })
    );
    expect(await screen.findByText('Published.')).toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(1);
  });

  it.each(['success', 'partial'] as const)(
    'retains a pending publication and its %s result after settings revoke availability',
    async (status) => {
      let complete: ((result: unknown) => void) | undefined;
      const pending = new Promise<unknown>((resolve) => {
        complete = resolve;
      });
      jest.mocked(apiCall).mockImplementation(async (endpoint) => {
        if (endpoint.endsWith('/preview')) return preview;
        if (endpoint.endsWith('/contribute')) return pending;
        return settings;
      });
      const { queryClient } = renderWithMutableSettings();
      await openPreview();
      approveBoth();
      fireEvent.click(
        screen.getByRole('button', { name: 'Publish this contribution' })
      );
      await screen.findByRole('button', { name: 'Publishing…' });

      await act(async () => revokeAvailability(queryClient));
      await screen.findByText(/Contributions require your own custom food/);
      expect(
        screen.getByRole('button', { name: 'Publishing…' })
      ).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onOpenChange).not.toHaveBeenCalled();
      await act(async () =>
        complete?.({
          status,
          message: 'The publication outcome remains available.',
          productUrl: preview.productUrl,
          providerScope: 'personal',
        })
      );
      expect(
        await screen.findByText('The publication outcome remains available.')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: preview.productUrl })
      ).toHaveAttribute('href', preview.productUrl);
      expect(
        screen.queryByRole('button', { name: 'Preview contribution' })
      ).not.toBeInTheDocument();
      expect(confirmCalls()).toHaveLength(1);
    }
  );

  it.each(['success', 'partial'] as const)(
    'retains an already returned %s result when settings revoke availability',
    async (status) => {
      jest.mocked(apiCall).mockImplementation(async (endpoint) => {
        if (endpoint.endsWith('/preview')) return preview;
        if (endpoint.endsWith('/contribute'))
          return {
            status,
            message: 'An existing publication result.',
            productUrl: preview.productUrl,
            providerScope: 'personal',
          };
        return settings;
      });
      const { queryClient } = renderWithMutableSettings();
      await openPreview();
      approveBoth();
      fireEvent.click(
        screen.getByRole('button', { name: 'Publish this contribution' })
      );
      await screen.findByText('An existing publication result.');
      await act(async () => revokeAvailability(queryClient));
      await screen.findByText(/Contributions require your own custom food/);
      expect(
        screen.getByText('An existing publication result.')
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: preview.productUrl })
      ).toHaveAttribute('href', preview.productUrl);
      expect(confirmCalls()).toHaveLength(1);
    }
  );

  it('disables new previews and publications when availability is revoked', async () => {
    const { queryClient } = renderWithMutableSettings();
    await openPreview();
    approveBoth();
    await act(async () => revokeAvailability(queryClient));
    await screen.findByText(/Contributions require your own custom food/);
    const publish = screen.getByRole('button', {
      name: 'Publish this contribution',
    });
    const nextPreview = screen.getByRole('button', {
      name: 'Preview contribution',
    });
    expect(publish).toBeDisabled();
    expect(nextPreview).toBeDisabled();
    fireEvent.click(publish);
    fireEvent.click(nextPreview);
    expect(confirmCalls()).toHaveLength(0);
    expect(
      jest
        .mocked(apiCall)
        .mock.calls.filter(([endpoint]) => endpoint.endsWith('/preview'))
    ).toHaveLength(1);
  });

  it('isolates pending publication state and close protection when switching owners', async () => {
    let complete: ((result: unknown) => void) | undefined;
    const pending = new Promise<unknown>((resolve) => {
      complete = resolve;
    });
    jest.mocked(apiCall).mockImplementation(async (endpoint) => {
      if (endpoint.endsWith('/preview')) return preview;
      if (endpoint.endsWith('/contribute')) return pending;
      return settings;
    });
    const { rerender } = renderWithMutableSettings();
    await openPreview();
    approveBoth();
    fireEvent.click(
      screen.getByRole('button', { name: 'Publish this contribution' })
    );
    await screen.findByRole('button', { name: 'Publishing…' });
    mockUser = { id: 'user-1', activeUserId: 'other-user' };
    rerender(
      <OpenFoodFactsContributionDialog
        open
        food={food}
        onOpenChange={onOpenChange}
      />
    );
    expect(
      screen.queryByRole('img', { name: 'Photo to publish' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await act(async () =>
      complete?.({
        status: 'success',
        message: 'First owner publication.',
        productUrl: preview.productUrl,
        providerScope: 'personal',
      })
    );
    expect(
      screen.queryByText('First owner publication.')
    ).not.toBeInTheDocument();
    mockUser = { id: 'user-1', activeUserId: 'user-1' };
    rerender(
      <OpenFoodFactsContributionDialog
        open
        food={food}
        onOpenChange={onOpenChange}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Preview contribution' })
    ).toBeDisabled();
    expect(
      screen.queryByText('First owner publication.')
    ).not.toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(1);
  });

  it('does not defer a confirmed public write until a later network reconnection', async () => {
    jest.mocked(apiCall).mockImplementation(async (endpoint) => {
      if (endpoint.endsWith('/preview')) return preview;
      if (endpoint.endsWith('/contribute'))
        throw new Error('Network disconnected');
      return settings;
    });
    renderWithClient(
      <OpenFoodFactsContributionDialog
        open
        food={food}
        onOpenChange={onOpenChange}
      />
    );
    await openPreview();
    approveBoth();
    onlineManager.setOnline(false);
    try {
      fireEvent.click(
        screen.getByRole('button', { name: 'Publish this contribution' })
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Network disconnected'
      );
      expect(confirmCalls()).toHaveLength(1);
    } finally {
      await act(async () => onlineManager.setOnline(true));
    }
    expect(confirmCalls()).toHaveLength(1);
  });

  it('does not publish when the preview expires before confirmation', async () => {
    renderWithClient(
      <OpenFoodFactsContributionDialog
        open
        food={food}
        onOpenChange={onOpenChange}
      />
    );
    await openPreview();
    approveBoth();
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse(preview.expiresAt) + 1);
    try {
      fireEvent.click(
        screen.getByRole('button', { name: 'Publish this contribution' })
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This preview expired.'
      );
      expect(confirmCalls()).toHaveLength(0);
    } finally {
      clock.mockRestore();
    }
  });

  it.each([
    ['delegate', { ...food }, { id: 'user-1', activeUserId: 'other-user' }],
    [
      'imported product',
      { ...food, provider_type: 'openfoodfacts' as const },
      { id: 'user-1', activeUserId: 'user-1' },
    ],
    [
      'another owner',
      { ...food, user_id: 'other-user' },
      { id: 'user-1', activeUserId: 'user-1' },
    ],
  ])(
    'does not offer contribution controls for a %s',
    async (_name, candidate, user) => {
      mockUser = user;
      renderWithClient(
        <OpenFoodFactsContributionDialog
          open
          food={candidate}
          onOpenChange={onOpenChange}
        />
      );
      await act(async () => undefined);
      expect(
        screen.queryByRole('button', { name: 'Preview contribution' })
      ).not.toBeInTheDocument();
      expect(confirmCalls()).toHaveLength(0);
      expect(
        jest
          .mocked(apiCall)
          .mock.calls.some(([endpoint]) => endpoint.endsWith('/preview'))
      ).toBe(false);
    }
  );
});
