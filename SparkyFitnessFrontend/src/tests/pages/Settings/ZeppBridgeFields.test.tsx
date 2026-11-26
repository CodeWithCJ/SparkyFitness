import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ProviderSpecificFields } from '@/pages/Settings/ProviderSpecificFields';
import type { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';

function Harness({
  onChange,
}: {
  onChange: (p: Partial<ExternalDataProvider>) => void;
}) {
  const [provider, setProvider] = useState<Partial<ExternalDataProvider>>({
    provider_type: 'zeppbridge',
    base_url: '',
    app_key: '',
  });
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

describe('ZeppBridge provider fields', () => {
  it('warns that it is a third-party integration and links the ZeppBridge project', () => {
    render(<Harness onChange={() => {}} />);

    expect(
      screen.getByText('Third-party integration: requires ZeppBridge')
    ).toBeTruthy();

    const repo = screen.getByRole('link', {
      name: 'the ZeppBridge project on GitHub',
    });
    expect(repo.getAttribute('href')).toBe(
      'https://github.com/lingcang728/ZeppBridge'
    );
    expect(repo.getAttribute('target')).toBe('_blank');
    expect(repo.getAttribute('rel')).toContain('noopener');

    const privacy = screen.getByRole('link', { name: 'privacy notes' });
    expect(privacy.getAttribute('href')).toBe(
      'https://github.com/lingcang728/ZeppBridge#privacy-and-connections'
    );
  });

  it('collects the URL and token, with no app id field', () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('ZeppBridge URL'), {
      target: { value: 'http://127.0.0.1:43921' },
    });
    fireEvent.change(screen.getByLabelText('Pull token'), {
      target: { value: 'pull-token' },
    });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        base_url: 'http://127.0.0.1:43921',
        app_key: 'pull-token',
      })
    );
    expect(screen.queryByLabelText(/App ID/i)).toBeNull();
  });
});
