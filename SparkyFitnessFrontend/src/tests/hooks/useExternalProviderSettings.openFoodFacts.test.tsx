import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { apiCall } from '@/api/api';
import {
  useCreateExternalProviderMutation,
  useCreateGlobalProvider,
  useDeleteExternalProviderMutation,
  useDeleteGlobalProvider,
  useToggleProviderStatusMutation,
  useUpdateExternalProviderMutation,
  useUpdateGlobalProvider,
} from '@/hooks/Settings/useExternalProviderSettings';
import { useOpenFoodFactsContributionSettings } from '@/hooks/Settings/useOpenFoodFactsContributions';
import { useUpdateSettings } from '@/hooks/Admin/useSettings';

jest.mock('@/api/api', () => ({
  apiCall: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ refetch: jest.fn() }),
  },
}));

type ProviderScope = 'personal' | 'global' | null;
type MutationKind =
  | 'createPersonal'
  | 'updatePersonal'
  | 'togglePersonal'
  | 'deletePersonal'
  | 'createGlobal'
  | 'updateGlobal'
  | 'deleteGlobal';

const mutationVariables: Record<MutationKind, unknown> = {
  createPersonal: {
    user_id: 'user-1',
    provider_name: 'Open Food Facts',
    provider_type: 'openfoodfacts',
    app_id: 'contributor',
    app_key: 'password',
    is_active: true,
  },
  updatePersonal: {
    id: 'personal-provider',
    data: { app_id: 'new-contributor' },
  },
  togglePersonal: { id: 'personal-provider', isActive: true },
  deletePersonal: 'personal-provider',
  createGlobal: {
    provider_name: 'Open Food Facts',
    provider_type: 'openfoodfacts',
    app_id: 'server-contributor',
    app_key: 'password',
    is_active: true,
  },
  updateGlobal: {
    id: 'global-provider',
    data: { is_active: true },
  },
  deleteGlobal: 'global-provider',
};

const useMutationUnderTest = (kind: MutationKind) => {
  const mutations = {
    createPersonal: useCreateExternalProviderMutation(),
    updatePersonal: useUpdateExternalProviderMutation(),
    togglePersonal: useToggleProviderStatusMutation(),
    deletePersonal: useDeleteExternalProviderMutation(),
    createGlobal: useCreateGlobalProvider(),
    updateGlobal: useUpdateGlobalProvider(),
    deleteGlobal: useDeleteGlobalProvider(),
  };

  return mutations[kind];
};

describe('Open Food Facts provider mutations', () => {
  let queryClient: QueryClient;
  let serverProviderScope: ProviderScope;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    serverProviderScope = null;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    jest.mocked(apiCall).mockImplementation(async (endpoint) => {
      if (endpoint === '/user-preferences/openfoodfacts-contributions') {
        return {
          serverEnabled: true,
          userEnabled: false,
          productLanguage: 'en',
          providerScope: serverProviderScope,
          status: { pending: 0, processing: 0, failed: 0, succeeded: 0 },
          recentFailures: [],
        };
      }

      return {
        id: 'provider-1',
        provider_name: 'Open Food Facts',
        provider_type: 'openfoodfacts',
        is_active: true,
        visibility: 'private',
      };
    });
  });

  afterEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  it.each([
    ['createPersonal', null, 'personal'],
    ['updatePersonal', 'global', 'personal'],
    ['togglePersonal', 'global', 'personal'],
    ['deletePersonal', 'personal', 'global'],
    ['createGlobal', null, 'global'],
    ['updateGlobal', null, 'global'],
    ['deleteGlobal', 'global', null],
  ] as const)(
    '%s immediately refreshes the available contribution account',
    async (kind, initialScope, expectedScope) => {
      serverProviderScope = initialScope;
      const { result } = renderHook(
        () => ({
          settings: useOpenFoodFactsContributionSettings(),
          mutation: useMutationUnderTest(kind),
        }),
        { wrapper }
      );

      await waitFor(() => expect(result.current.settings.isSuccess).toBe(true));
      expect(result.current.settings.data?.providerScope).toBe(initialScope);

      serverProviderScope = expectedScope;
      await act(async () => {
        await result.current.mutation.mutateAsync(
          mutationVariables[kind] as never
        );
      });

      await waitFor(() =>
        expect(result.current.settings.data?.providerScope).toBe(expectedScope)
      );
    }
  );
});

describe('Open Food Facts server gate mutation', () => {
  let queryClient: QueryClient;
  let serverEnabled: boolean;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    serverEnabled = false;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    jest.mocked(apiCall).mockImplementation(async (endpoint) => {
      if (endpoint === '/user-preferences/openfoodfacts-contributions') {
        return {
          serverEnabled,
          userEnabled: false,
          productLanguage: 'en',
          providerScope: 'personal',
          status: { pending: 0, processing: 0, failed: 0, succeeded: 0 },
          recentFailures: [],
        };
      }

      return {
        enable_email_password_login: true,
        is_oidc_active: false,
        is_mfa_mandatory: false,
        allow_openfoodfacts_contributions: serverEnabled,
      };
    });
  });

  afterEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
  });

  it('immediately refreshes user availability when an administrator changes the gate', async () => {
    const { result } = renderHook(
      () => ({
        settings: useOpenFoodFactsContributionSettings(),
        mutation: useUpdateSettings(),
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.settings.isSuccess).toBe(true));
    expect(result.current.settings.data?.serverEnabled).toBe(false);

    serverEnabled = true;
    await act(async () => {
      await result.current.mutation.mutateAsync({
        enable_email_password_login: true,
        is_oidc_active: false,
        is_mfa_mandatory: false,
        allow_openfoodfacts_contributions: true,
      });
    });

    await waitFor(() =>
      expect(result.current.settings.data?.serverEnabled).toBe(true)
    );
  });
});
