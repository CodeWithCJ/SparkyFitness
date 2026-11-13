import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import ServerGate, { ServerStatusView } from '../../src/components/ServerGate';
import type { ServerConnectionStatus } from '../../src/hooks/useServerConnection';

jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn(() => ['#0af', '#888', '#f33']),
}));

jest.mock('../../src/components/Icon', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  const MockIcon = ({ name }: { name: string }) => (
    <MockText testID={`icon-${name}`}>{name}</MockText>
  );
  return { __esModule: true, default: MockIcon };
});

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockRefetch = jest.fn(() => Promise.resolve({ data: false }));
const mockConnection = {
  status: 'connected' as ServerConnectionStatus,
  isFetching: false,
};
jest.mock('../../src/hooks', () => ({
  useServerConnection: () => ({
    ...mockConnection,
    isConnected: mockConnection.status === 'connected',
    refetch: mockRefetch,
  }),
}));

const renderGate = () =>
  render(
    <ServerGate>
      <Text>Screen content</Text>
    </ServerGate>
  );

describe('ServerGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection.status = 'connected';
    mockConnection.isFetching = false;
  });

  it('renders the screen content when connected', () => {
    const { getByText, queryByText } = renderGate();
    expect(getByText('Screen content')).toBeTruthy();
    expect(queryByText("Can't reach your server")).toBeNull();
  });

  it('shows a spinner, not the content, while the first check runs', () => {
    mockConnection.status = 'loading';
    const { queryByText, UNSAFE_queryByType } = renderGate();
    const { ActivityIndicator } = jest.requireActual('react-native');
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
    expect(queryByText('Screen content')).toBeNull();
  });

  it('says no server is configured and links to Settings when none is set up', () => {
    mockConnection.status = 'notConfigured';
    const { getByText, queryByText } = renderGate();

    expect(getByText('No server configured')).toBeTruthy();
    expect(queryByText('Try again')).toBeNull();
    fireEvent.press(getByText('Go to Settings'));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Settings' });
  });

  it('says the server is unreachable, not unconfigured, when a set-up server fails the check', () => {
    mockConnection.status = 'unreachable';
    const { getByText, queryByText } = renderGate();

    expect(queryByText('No server configured')).toBeNull();
    expect(queryByText('Screen content')).toBeNull();
    expect(getByText("Can't reach your server")).toBeTruthy();

    fireEvent.press(getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Go to Settings'));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Settings' });
  });

  it('shows a spinner while a retry is running', () => {
    mockConnection.status = 'unreachable';
    mockConnection.isFetching = true;
    const { queryByText, UNSAFE_queryByType } = render(<ServerStatusView />);
    const { ActivityIndicator } = jest.requireActual('react-native');
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
    expect(queryByText("Can't reach your server")).toBeNull();
  });
});
