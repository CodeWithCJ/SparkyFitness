import { useState } from 'react';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EditProviderForm } from '@/pages/Settings/EditProviderForm';
import type { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import { renderWithClient } from '../test-utils';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings.foodExerciseDataProviders.openFoodFacts.baseUrlLabel':
          'Base URL',
        'settings.foodExerciseDataProviders.openFoodFacts.baseUrlHelp':
          'Open Food Facts server URL',
        'settings.foodExerciseDataProviders.openFoodFacts.credentialContributionHelp':
          'Credentials enable contributions.',
        'settings.foodExerciseDataProviders.openFoodFacts.credentialKeepExistingHelp':
          'Leave blank to keep existing credentials.',
      })[key] ?? key,
  }),
}));

jest.mock('@/hooks/Settings/useExternalProviderSettings', () => ({
  useExternalProviderTypesQuery: () => ({
    data: [
      {
        id: 'openfoodfacts',
        display_name: 'Open Food Facts',
        is_strictly_private: false,
      },
    ],
  }),
}));

const provider: ExternalDataProvider = {
  id: 'global-off',
  provider_name: 'Open Food Facts',
  provider_type: 'openfoodfacts',
  app_id: null,
  app_key: null,
  is_active: true,
  base_url: 'https://world.openfoodfacts.org',
  visibility: 'public',
};

const Harness = ({ isAdminMode }: { isAdminMode: boolean }) => {
  const [editData, setEditData] =
    useState<Partial<ExternalDataProvider>>(provider);
  return (
    <EditProviderForm
      provider={provider}
      editData={editData}
      setEditData={setEditData}
      onSubmit={jest.fn()}
      onCancel={jest.fn()}
      loading={false}
      isAdminMode={isAdminMode}
    />
  );
};

describe('EditProviderForm Open Food Facts credentials', () => {
  it.each([false, true])(
    'keeps contribution consent out of the provider form (admin mode: %s)',
    (isAdminMode) => {
      renderWithClient(<Harness isAdminMode={isAdminMode} />);

      expect(
        screen.getByText(/Credentials enable contributions/)
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('switch', {
          name: 'Automatically contribute eligible products',
        })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('switch', {
          name: 'Allow server-wide Open Food Facts contributions',
        })
      ).not.toBeInTheDocument();
    }
  );

  it('keeps the account fields available in personal settings', () => {
    renderWithClient(<Harness isAdminMode={false} />);

    expect(
      screen.getByRole('textbox', { name: 'Base URL' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', {
        name: 'Open Food Facts Username (Optional)',
      })
    ).toHaveAttribute('autocomplete', 'username');
    expect(
      screen.getByLabelText('Open Food Facts Password (Optional)')
    ).toHaveAttribute('autocomplete', 'current-password');
    expect(
      screen.getByPlaceholderText('(leave blank to keep existing)')
    ).toBeInTheDocument();
  });
});
