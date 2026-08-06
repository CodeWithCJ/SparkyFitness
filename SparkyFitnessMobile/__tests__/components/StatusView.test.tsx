import { render, fireEvent } from '@testing-library/react-native';
import StatusView from '../../src/components/StatusView';

jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn(() => ['#0af', '#888', '#f33']),
}));

jest.mock('../../src/components/Icon', () => {
  const { Text } = jest.requireActual('react-native');
  const MockIcon = ({ name, color }: { name: string; color: string }) => (
    <Text testID={`icon-${name}`}>{color}</Text>
  );
  return { __esModule: true, default: MockIcon };
});

describe('StatusView', () => {
  it('renders a spinner and no icon when loading, even if an icon is given', () => {
    const { queryByTestId, UNSAFE_queryByType } = render(
      <StatusView loading icon="alert-circle" title="Loading..." />,
    );
    const { ActivityIndicator } = jest.requireActual('react-native');
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeTruthy();
    expect(queryByTestId('icon-alert-circle')).toBeNull();
  });

  it('resolves the icon color from iconTone', () => {
    const { getByTestId } = render(<StatusView icon="alert-circle" iconTone="danger" />);
    expect(getByTestId('icon-alert-circle').props.children).toBe('#f33');
  });

  it('lets an explicit iconColor override the tone', () => {
    const { getByTestId } = render(
      <StatusView icon="cloud-offline" iconTone="muted" iconColor="#123456" />,
    );
    expect(getByTestId('icon-cloud-offline').props.children).toBe('#123456');
  });

  it('fires the action handler', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <StatusView title="Failed" action={{ label: 'Retry', onPress }} />,
    );
    fireEvent.press(getByText('Retry'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders nothing above the title when neither loading nor icon is set', () => {
    const { UNSAFE_queryByType, queryByText } = render(
      <StatusView inline title="Empty" subtitle="Nothing here." />,
    );
    const { ActivityIndicator } = jest.requireActual('react-native');
    expect(UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    expect(queryByText('Empty')).toBeTruthy();
    expect(queryByText('Nothing here.')).toBeTruthy();
  });
});
