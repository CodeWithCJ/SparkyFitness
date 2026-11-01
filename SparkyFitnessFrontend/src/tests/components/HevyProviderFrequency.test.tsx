import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { apiCall } from '@/api/api';
import AddExternalProviderForm from '@/pages/Settings/AddExternalProviderForm';
import { EditProviderForm } from '@/pages/Settings/EditProviderForm';
import type { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import { renderWithClient } from '../test-utils';

jest.mock('@/api/api', () => ({ apiCall: jest.fn() }));
jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', activeUserId: 'user-1' } }),
}));

const hevyProvider: ExternalDataProvider = {
  id: 'hevy-1',
  provider_type: 'hevy',
  provider_name: 'My Hevy',
  app_id: null,
  app_key: null,
  is_active: true,
  base_url: null,
  visibility: 'private',
  sync_frequency: 'manual',
};

function EditHarness({
  initial = hevyProvider,
  onSave,
}: {
  initial?: ExternalDataProvider;
  onSave: (provider: Partial<ExternalDataProvider>) => void;
}) {
  const [editData, setEditData] =
    useState<Partial<ExternalDataProvider>>(initial);
  return (
    <EditProviderForm
      provider={initial}
      editData={editData}
      setEditData={setEditData}
      onSubmit={async () => onSave(editData)}
      onCancel={() => {}}
      loading={false}
    />
  );
}

async function chooseOption(trigger: HTMLElement, name: string) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(await screen.findByRole('option', { name }));
}

describe('Hevy sync frequency settings', () => {
  beforeEach(() => {
    jest.mocked(apiCall).mockImplementation(async (endpoint) => {
      if (endpoint === '/external-providers/types') {
        return [
          {
            id: 'hevy',
            display_name: 'Hevy',
            is_strictly_private: true,
            categories: ['exercise'],
            required_fields: ['app_key'],
            field_labels: { app_key: 'Hevy API Key' },
            supports_barcode: false,
          },
        ];
      }
      return { ...hevyProvider, is_active: false };
    });
  });

  afterEach(() => jest.clearAllMocks());

  it.each([
    { choice: undefined, expected: 'manual' },
    { choice: 'Daily at 21:00', expected: 'daily' },
    { choice: 'Hourly', expected: 'hourly' },
  ])(
    'saves $expected when adding a Hevy connection',
    async ({ choice, expected }) => {
      renderWithClient(
        <AddExternalProviderForm
          showAddForm
          setShowAddForm={() => {}}
          onAddSuccess={() => {}}
        />
      );
      await chooseOption(screen.getByRole('combobox'), 'Hevy');
      fireEvent.change(screen.getByLabelText('Provider Name'), {
        target: { value: 'My Hevy' },
      });
      fireEvent.change(screen.getByLabelText('API Key / App Key'), {
        target: { value: 'test-key' },
      });

      const frequency = screen.getByRole('combobox', {
        name: 'Sync Frequency',
      });
      expect(frequency).toHaveTextContent('Manual');
      if (choice) await chooseOption(frequency, choice);
      fireEvent.click(screen.getByRole('button', { name: 'Add Provider' }));

      await waitFor(() => {
        expect(apiCall).toHaveBeenCalledWith(
          '/external-providers',
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining(`"sync_frequency":"${expected}"`),
          })
        );
      });
    }
  );

  it('preserves an existing manual connection until the person changes its frequency', () => {
    const onSave = jest.fn();
    renderWithClient(<EditHarness onSave={onSave} />);

    expect(
      screen.getByRole('combobox', { name: 'Sync Frequency' })
    ).toHaveTextContent('Manual');
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ sync_frequency: 'manual' })
    );
  });

  it('explains the local evening schedule and lets the person select it while editing', async () => {
    const onSave = jest.fn();
    renderWithClient(<EditHarness onSave={onSave} />);
    const frequency = screen.getByRole('combobox', { name: 'Sync Frequency' });

    expect(frequency).toHaveAccessibleDescription(
      /21:00.*SparkyFitness timezone/
    );
    await chooseOption(frequency, 'Daily at 21:00');
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ sync_frequency: 'daily' })
    );
  });

  it('preserves the Intervals.icu credentials and existing daily option', async () => {
    const onSave = jest.fn();
    renderWithClient(
      <EditHarness
        initial={{ ...hevyProvider, provider_type: 'intervals' }}
        onSave={onSave}
      />
    );

    expect(screen.getByText('Athlete ID')).toBeInTheDocument();
    await chooseOption(
      screen.getByRole('combobox', { name: 'Sync Frequency' }),
      'Daily'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_type: 'intervals',
        sync_frequency: 'daily',
      })
    );
  });
});
