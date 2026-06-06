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

  it('uses YAZIO-specific credential labels', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_name: 'YAZIO',
      provider_type: 'yazio',
      app_id: 'user@example.com',
    };
    const result = validateProvider(input);
    expect(result).toBe('Please provide YAZIO Client ID for yazio');
  });

  it('requires YAZIO OAuth client credentials', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_name: 'YAZIO',
      provider_type: 'yazio',
      app_id: 'user@example.com',
      app_key: 'password',
      yazio_client_id: 'client-id',
    };
    const result = validateProvider(input);
    expect(result).toBe('Please provide YAZIO Client Secret for yazio');
  });

  it('allows YAZIO with only client credentials (no email/password)', () => {
    const input: Partial<ExternalDataProvider> = {
      provider_name: 'YAZIO',
      provider_type: 'yazio',
      yazio_client_id: 'client-id',
      yazio_client_secret: 'client-secret',
    };
    const result = validateProvider(input);
    expect(result).toBeNull();
  });
});
