import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ProviderSpecificFields } from '@/pages/Settings/ProviderSpecificFields';
import type { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import { ROUTING_PROVIDER_TYPE } from '@workspace/shared';
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
    <>
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
    </>
  );
}

describe('Valhalla routing provider fields', () => {
  const base: Partial<ExternalDataProvider> = {
    provider_type: ROUTING_PROVIDER_TYPE,
    base_url: '',
    app_key: '',
  };

  it('shows an empty server URL (there is no default server) and an optional API key', () => {
    render(<Harness initial={base} onChange={() => {}} />);
    const url = screen.getByLabelText(
      'Valhalla server URL'
    ) as HTMLInputElement;
    expect(url.value).toBe('');
    // The placeholder is an example, not the public demo server.
    expect(url.placeholder).not.toMatch(/openstreetmap\.de/);
    const key = screen.getByLabelText('API key (optional)');
    // The key is a password field and never shown in clear.
    expect(key.getAttribute('type')).toBe('password');
  });

  it('says plainly that route points are sent to the chosen server', () => {
    render(<Harness initial={base} onChange={() => {}} />);
    expect(
      screen.getByText(/are sent to this server, which can see them/)
    ).toBeTruthy();
    expect(screen.getByText(/There is no default server/)).toBeTruthy();
    expect(
      screen.getByText(/not meant for production use by third parties/)
    ).toBeTruthy();
    expect(screen.getByText(/non-commercial use only/)).toBeTruthy();
  });

  it('lets the person change the URL and set a key', () => {
    const onChange = jest.fn();
    render(<Harness initial={base} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Valhalla server URL'), {
      target: { value: 'https://valhalla.example.org' },
    });
    fireEvent.change(screen.getByLabelText('API key (optional)'), {
      target: { value: 'secret' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        base_url: 'https://valhalla.example.org',
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
        provider_name: 'Routing',
        provider_type: ROUTING_PROVIDER_TYPE,
        base_url: 'https://valhalla.example.org',
      })
    ).toBeNull();
    expect(
      validateProvider({
        provider_name: 'Routing',
        provider_type: ROUTING_PROVIDER_TYPE,
      })
    ).toBe('Please provide base_url for valhalla');
  });
});
