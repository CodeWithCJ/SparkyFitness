import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import ActiveWorkoutFocusMedia from '../../src/components/ActiveWorkoutFocusMedia';
import { useOpenLightbox } from '../../src/components/LightboxProvider';

jest.mock('../../src/components/LightboxProvider', () => ({
  useOpenLightbox: jest.fn(),
}));
jest.mock('../../src/components/SafeImage', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ source }: { source: { uri: string } | null }) => (
      <View testID="safe-image" accessibilityValue={{ text: source?.uri }} />
    ),
  };
});

const openLightbox = jest.fn();
const getImageSource = (path: string) =>
  path.startsWith('bad') ? null : { uri: `https://img/${path}` };

function renderMedia(
  props: Partial<React.ComponentProps<typeof ActiveWorkoutFocusMedia>> = {}
) {
  const onToggleExpanded = jest.fn();
  render(
    <ActiveWorkoutFocusMedia
      images={['a.jpg', 'b.jpg']}
      exerciseName="Squat"
      getImageSource={getImageSource}
      expanded
      onToggleExpanded={onToggleExpanded}
      {...props}
    >
      <Text>Title block</Text>
    </ActiveWorkoutFocusMedia>
  );
  return { onToggleExpanded };
}

const frame = () =>
  screen.getByTestId('safe-image').props.accessibilityValue.text;

describe('ActiveWorkoutFocusMedia', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    openLightbox.mockClear();
    (useOpenLightbox as jest.Mock).mockReturnValue(openLightbox);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('shows pills when expanded and minimizes on press', () => {
    const { onToggleExpanded } = renderMedia();
    expect(screen.queryByText('Title block')).toBeNull();
    fireEvent.press(screen.getByLabelText('Minimize Squat image'));
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Pause')).toBeTruthy();
  });

  it.each([true, false])(
    'offers Back to current only when asked (expanded: %s)',
    (expanded) => {
      renderMedia({ expanded });
      expect(screen.queryByText('Back to current')).toBeNull();
      const onBackToCurrent = jest.fn();
      renderMedia({ expanded, onBackToCurrent });
      fireEvent.press(screen.getByText('Back to current'));
      expect(onBackToCurrent).toHaveBeenCalledTimes(1);
    }
  );

  it('renders the thumbnail with children when minimized and expands on press', () => {
    const { onToggleExpanded } = renderMedia({ expanded: false });
    expect(screen.getByText('Title block')).toBeTruthy();
    expect(screen.queryByText('Minimize')).toBeNull();
    fireEvent.press(screen.getByLabelText('Expand Squat image'));
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
    expect(openLightbox).not.toHaveBeenCalled();
  });

  it('opens the lightbox on long press of the thumbnail', () => {
    renderMedia({ expanded: false });
    fireEvent(screen.getByLabelText('Expand Squat image'), 'longPress');
    expect(openLightbox).toHaveBeenCalledWith(['a.jpg', 'b.jpg'], 0, 'Squat');
  });

  it('cycles frames and pause/play toggles the cycling', () => {
    renderMedia();
    expect(frame()).toBe('https://img/a.jpg');
    act(() => jest.advanceTimersByTime(1000));
    expect(frame()).toBe('https://img/b.jpg');

    fireEvent.press(screen.getByLabelText('Pause Squat animation'));
    act(() => jest.advanceTimersByTime(3000));
    expect(frame()).toBe('https://img/b.jpg');

    fireEvent.press(screen.getByLabelText('Play Squat animation'));
    act(() => jest.advanceTimersByTime(1000));
    expect(frame()).toBe('https://img/a.jpg');
  });

  it('opens the lightbox at the current frame', () => {
    renderMedia();
    act(() => jest.advanceTimersByTime(1000));
    fireEvent.press(screen.getByLabelText('View Squat image full screen'));
    expect(openLightbox).toHaveBeenCalledWith(['a.jpg', 'b.jpg'], 1, 'Squat');
  });

  it('hides the pause pill for a single image and skips unusable paths', () => {
    renderMedia({ images: ['a.jpg', 'bad.jpg'] });
    expect(screen.queryByText('Pause')).toBeNull();
    act(() => jest.advanceTimersByTime(3000));
    expect(frame()).toBe('https://img/a.jpg');
  });

  it('shows a placeholder with children and no pills without images', () => {
    renderMedia({ images: [] });
    expect(screen.getByTestId('focus-media-placeholder')).toBeTruthy();
    expect(screen.getByText('Title block')).toBeTruthy();
    expect(screen.queryByText('Minimize')).toBeNull();
    expect(screen.queryByText('Pause')).toBeNull();
  });

  it('does not cycle when Reduce Motion is on', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    renderMedia();
    act(() => jest.advanceTimersByTime(3000));
    expect(frame()).toBe('https://img/a.jpg');
  });
});
