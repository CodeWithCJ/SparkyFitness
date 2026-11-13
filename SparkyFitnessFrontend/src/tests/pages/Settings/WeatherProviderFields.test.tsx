import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ProviderSpecificFields } from '@/pages/Settings/ProviderSpecificFields';
import type { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import {
  OPEN_METEO_PUBLIC_URL,
  WEATHER_PROVIDER_TYPE,
} from '@workspace/shared';
import { validateProvider } from '@/utils/settings';

function Harness({
  initial,
  onChange,
}: {
  initial: Partial<ExternalDataProvider>;
  onChange: (p: Partial<ExternalDataProvider>) => void;
}) {
  const [provider, setProvider] = useState(initial);
  return (
    <ProviderSpecificFields
      provider={provider}
      setProvider={(update) => {
        setProvider((prev) => {
          const next = typeof update === 'function' ? update(prev) : update;
          onChange(next);
          return next;
        });
      }}
      fullSyncOnConnect={false}
      setFullSyncOnConnect={() => {}}
      onCopy={() => {}}
    />
  );
}

describe('Open-Meteo weather provider fields', () => {
  const base: Partial<ExternalDataProvider> = {
    provider_type: WEATHER_PROVIDER_TYPE,
    base_url: '',
    app_key: '',
  };

  it('suggests the public endpoint as a placeholder without filling it in', () => {
    render(<Harness initial={base} onChange={() => {}} />);
    const url = screen.getByLabelText(
      'Open-Meteo server URL'
    ) as HTMLInputElement;
    expect(url.value).toBe('');
    expect(url.placeholder).toBe(OPEN_METEO_PUBLIC_URL);
    const key = screen.getByLabelText('API key (optional)');
    expect(key.getAttribute('type')).toBe('password');
    expect((key as HTMLInputElement).value).toBe('');
  });

  it('says what is sent to the server and that the free tier is non-commercial', () => {
    render(<Harness initial={base} onChange={() => {}} />);
    expect(
      screen.getByText(/start place, rounded to two decimals/)
    ).toBeTruthy();
    expect(
      screen.getByText(/time a GPS-recorded activity started/)
    ).toBeTruthy();
    expect(
      screen.getByText(/With no weather provider, nothing is/)
    ).toBeTruthy();
    expect(screen.getByText(/for non-commercial use only/)).toBeTruthy();
  });

  it('lets the person change the URL and set a key', () => {
    const onChange = jest.fn();
    render(<Harness initial={base} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Open-Meteo server URL'), {
      target: { value: 'https://customer-api.open-meteo.com' },
    });
    fireEvent.change(screen.getByLabelText('API key (optional)'), {
      target: { value: 'secret' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        base_url: 'https://customer-api.open-meteo.com',
        app_key: 'secret',
      })
    );
  });

  it('does not render the generic App URL or App ID fields', () => {
    render(<Harness initial={base} onChange={() => {}} />);
    expect(screen.queryByLabelText('App URL')).toBeNull();
    expect(screen.queryByLabelText('App ID')).toBeNull();
  });

  it('needs a URL but no key to save', () => {
    expect(
      validateProvider({
        provider_name: 'Weather',
        provider_type: WEATHER_PROVIDER_TYPE,
        base_url: 'https://weather.example.org',
      })
    ).toBeNull();
    expect(
      validateProvider({
        provider_name: 'Weather',
        provider_type: WEATHER_PROVIDER_TYPE,
      })
    ).toBe('Please provide base_url for open_meteo');
  });
});
