import { useState } from 'react';
import { screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FoodProviderApiKeyField } from '@/pages/Settings/FoodProviderApiKeyField';
import { renderWithClient } from '../test-utils';

jest.mock('react-i18next', () => ({
  ...jest.requireActual('@/tests/mocks/reactI18next'),
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) =>
      ({
        'settings.editProviderForm.apiKey': 'API Key',
        'settings.editProviderForm.enterUSDAAPIKey': 'Enter USDA API Key',
      })[key] ??
      defaultValue ??
      key,
  }),
  Trans: ({ defaults, components }: any) => {
    return (
      <span>
        {defaults}
        {components?.link}
      </span>
    );
  },
}));

describe('FoodProviderApiKeyField', () => {
  it('renders USDA API Key field with correct label and placeholder', () => {
    const Harness = () => {
      const [key, setKey] = useState('');
      return (
        <FoodProviderApiKeyField
          providerType="usda"
          appKey={key}
          onChange={setKey}
          idPrefix="edit"
        />
      );
    };

    renderWithClient(<Harness />);

    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    const input = screen.getByPlaceholderText('Enter USDA API Key');
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'test-key-123' } });
    expect(input).toHaveValue('test-key-123');
  });
});
