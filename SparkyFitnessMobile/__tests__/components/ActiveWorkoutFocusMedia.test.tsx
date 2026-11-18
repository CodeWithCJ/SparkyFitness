import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import ActiveWorkoutFocusMedia from '../../src/components/ActiveWorkoutFocusMedia';
import { useOpenLightbox } from '../../src/components/LightboxProvider';

jest.mock('../../src/components/LightboxProvider', () => ({
  useOpenLightbox: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: jest.fn(() => true),
}));
jest.mock('../../src/components/SafeImage', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      source,
      autoplay,
    }: {
      source: { uri: string } | null;
      autoplay?: boolean;
    }) => (
      <View
        testID="safe-image"
        accessibilityValue={{ text: source?.uri }}
        accessibilityHint={autoplay ? 'animated' : 'still'}
      />
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

  it.each([true, false])(
    'stays collapsed with no placeholder, children or pills without images (expanded: %s)',
    (expanded) => {
      renderMedia({ images: [], expanded });
      expect(screen.queryByTestId('focus-media-placeholder')).toBeNull();
      expect(screen.queryByTestId('safe-image')).toBeNull();
      expect(screen.queryByText('Title block')).toBeNull();
      expect(screen.queryByText('Minimize')).toBeNull();
      expect(screen.queryByText('Pause')).toBeNull();
    }
  );

  it('keeps Back to current when there are no pictures', () => {
    const onBackToCurrent = jest.fn();
    renderMedia({ images: [], onBackToCurrent });
    fireEvent.press(screen.getByText('Back to current'));
    expect(onBackToCurrent).toHaveBeenCalledTimes(1);
  });

  it('does not cycle when Reduce Motion is on', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    renderMedia();
    act(() => jest.advanceTimersByTime(3000));
    expect(frame()).toBe('https://img/a.jpg');
  });

  it('shows a still of the first picture as the minimized thumbnail', () => {
    renderMedia({ expanded: false });
    const thumb = screen.getByTestId('safe-image');
    expect(thumb.props.accessibilityHint).toBe('still');
    act(() => jest.advanceTimersByTime(3000));
    expect(frame()).toBe('https://img/a.jpg');
  });

  it('animates only the enlarged demo', () => {
    renderMedia({ expanded: true });
    expect(screen.getByTestId('safe-image').props.accessibilityHint).toBe(
      'animated'
    );
    fireEvent.press(screen.getByLabelText('Pause Squat animation'));
    expect(screen.getByTestId('safe-image').props.accessibilityHint).toBe(
      'still'
    );
  });

  it('stops animating while the screen is not focused', () => {
    (useIsFocused as jest.Mock).mockReturnValue(false);
    renderMedia({ expanded: true });
    act(() => jest.advanceTimersByTime(3000));
    expect(frame()).toBe('https://img/a.jpg');
    expect(screen.getByTestId('safe-image').props.accessibilityHint).toBe(
      'still'
    );
    (useIsFocused as jest.Mock).mockReturnValue(true);
  });
});
