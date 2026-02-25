import { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import { validateProvider } from '@/utils/settings';

describe('validateProvider', () => {
  it('returns error if provider_name is missing', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_type: 'mealie',
    };
    const result = validateProvider(input);
    expect(result).toBe('Please fill in the provider name');
  });

  it('returns error if required field is missing', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_name: 'My Provider',
      provider_type: 'mealie',
      app_key: 'secret123',
    };
    const result = validateProvider(input);
    expect(result).toBe('Please provide base_url for mealie');
  });

  it('returns null if all required fields are present', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_name: 'My Provider',
      provider_type: 'mealie',
      base_url: 'http://localhost',
      app_key: 'secret123',
    };
    const result = validateProvider(input);
    expect(result).toBeNull();
  });

  it('returns null for provider without specific requirements', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_name: 'My Provider',
      provider_type: 'openfoodfacts',
    };
    const result = validateProvider(input);
    expect(result).toBeNull();
  });
});
