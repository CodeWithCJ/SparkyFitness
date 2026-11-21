import { render, screen } from '@testing-library/react';
import SyncRangeDialog from '@/pages/Settings/SyncRangeDialog';

jest.mock('@/hooks/Admin/useSettings', () => ({
  useMockDataEnabled: () => ({ data: true }),
}));

const renderDialog = (providerType: string) =>
  render(
    <SyncRangeDialog
      isOpen
      onClose={() => {}}
      onSync={() => {}}
      providerType={providerType}
    />
  );

describe('SyncRangeDialog troubleshooting controls', () => {
  it('shows the capture and replay controls for a provider that supports them', () => {
    renderDialog('intervals');
    expect(screen.getByText('Troubleshooting')).toBeTruthy();
  });

  it('hides them for ZeppBridge, whose sync takes no capture or replay options', () => {
    renderDialog('zeppbridge');
    expect(screen.queryByText('Troubleshooting')).toBeNull();
    // A normal sync is still offered.
    expect(screen.getByRole('button', { name: /sync/i })).toBeTruthy();
  });
});
