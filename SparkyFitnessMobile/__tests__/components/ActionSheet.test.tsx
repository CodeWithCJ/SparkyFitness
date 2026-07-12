import React from 'react';
import { BackHandler, Platform } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import ActionSheet, {
  type ActionSheetItem,
  type ActionSheetRef,
} from '../../src/components/ActionSheet';

// Controllable gorhom mock (overrides the inert global one): captures the
// modal's onAnimate/onDismiss props so tests can fire lifecycle events in
// production order — present/dismiss do NOT synchronously fire onDismiss
// (in production onDismiss arrives only after the close animation).
const mockModal: {
  present: jest.Mock;
  dismiss: jest.Mock;
  props: { onAnimate?: (from: number, to: number) => void; onDismiss?: () => void } | null;
} = { present: jest.fn(), dismiss: jest.fn(), props: null };

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, ScrollView } = require('react-native');
  return {
    BottomSheetModal: React.forwardRef((props: any, ref: any) => {
      React.useEffect(() => {
        mockModal.props = props;
      });
      React.useImperativeHandle(ref, () => ({
        present: mockModal.present,
        dismiss: mockModal.dismiss,
      }));
      return React.createElement(View, null, props.children);
    }),
    BottomSheetScrollView: ({ children }: any) => React.createElement(ScrollView, null, children),
    BottomSheetBackdrop: () => null,
  };
});

function makeItems() {
  return {
    onView: jest.fn(),
    onPick: jest.fn(),
    onRemove: jest.fn(),
  };
}

function renderSheet(overrides?: {
  items?: ActionSheetItem[];
  onBack?: () => void;
  onDismiss?: () => void;
}) {
  const handlers = makeItems();
  const items: ActionSheetItem[] = overrides?.items ?? [
    { key: 'view', label: 'View exercise', onPress: handlers.onView },
    {
      key: 'superset-with',
      label: 'Superset with…',
      dismissOnPress: false,
      onPress: handlers.onPick,
    },
    {
      key: 'remove',
      label: 'Remove exercise',
      destructive: true,
      onPress: handlers.onRemove,
    },
  ];
  const onDismiss = overrides?.onDismiss ?? jest.fn();
  const ref = React.createRef<ActionSheetRef>();
  const utils = render(
    <ActionSheet
      ref={ref}
      title="Bench Press"
      items={items}
      onBack={overrides?.onBack}
      onDismiss={onDismiss}
    />,
  );
  return { ...utils, ref, onDismiss, handlers };
}

/** Simulate the modal finishing its open animation. */
function fireOpened() {
  act(() => mockModal.props?.onAnimate?.(-1, 0));
}

/** Simulate a swipe/backdrop dismissal starting. */
function fireDismissStart() {
  act(() => mockModal.props?.onAnimate?.(0, -1));
}

/** Simulate the close animation completing (gorhom's terminal onDismiss). */
function fireDismissed() {
  act(() => mockModal.props?.onDismiss?.());
}

describe('ActionSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockModal.props = null;
    // Synchronous rAF so schedulePresent lands immediately.
    jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
    jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the title and accessible rows', () => {
    const { getByText, getByLabelText, getByTestId } = renderSheet();
    expect(getByText('Bench Press')).toBeTruthy();
    expect(getByTestId('action-sheet-item-view')).toBeTruthy();
    expect(getByLabelText('View exercise').props.accessibilityRole).toBe('button');
    expect(getByLabelText('Remove exercise')).toBeTruthy();
  });

  it('renders a destructive row', () => {
    const { getByText } = renderSheet();
    expect(getByText('Remove exercise')).toBeTruthy();
  });

  it('presents through the ref via rAF', () => {
    const { ref } = renderSheet();
    act(() => ref.current?.present());
    expect(mockModal.present).toHaveBeenCalledTimes(1);
  });

  it('dismisses then fires the row action; owner onDismiss waits for the close animation', () => {
    const { ref, getByTestId, onDismiss, handlers } = renderSheet();
    act(() => ref.current?.present());
    fireOpened();

    fireEvent.press(getByTestId('action-sheet-item-view'));
    expect(mockModal.dismiss).toHaveBeenCalledTimes(1);
    expect(handlers.onView).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();

    fireDismissed();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps the sheet presented for dismissOnPress: false items', () => {
    const { ref, getByTestId, handlers } = renderSheet();
    act(() => ref.current?.present());
    fireOpened();

    fireEvent.press(getByTestId('action-sheet-item-superset-with'));
    expect(handlers.onPick).toHaveBeenCalledTimes(1);
    expect(mockModal.dismiss).not.toHaveBeenCalled();
  });

  it('renders and fires the back chevron only when onBack is provided', () => {
    const onBack = jest.fn();
    const withBack = renderSheet({ onBack });
    fireEvent.press(withBack.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    withBack.unmount();

    const withoutBack = renderSheet();
    expect(withoutBack.queryByLabelText('Back')).toBeNull();
  });

  it('queues a present that lands mid-dismissal and swallows the stale onDismiss', () => {
    const { ref, onDismiss } = renderSheet();
    act(() => ref.current?.present());
    fireOpened();
    expect(mockModal.present).toHaveBeenCalledTimes(1);

    // Swipe-down starts closing; the user immediately opens another menu.
    fireDismissStart();
    act(() => ref.current?.present());
    expect(mockModal.present).toHaveBeenCalledTimes(1);

    // The interrupted close completes: the queued present runs and the
    // owner's onDismiss is suppressed so it can't clear the newer state.
    fireDismissed();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(mockModal.present).toHaveBeenCalledTimes(2);

    // A later, uninterrupted dismissal still propagates.
    fireOpened();
    fireDismissStart();
    fireDismissed();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores present while already open', () => {
    const { ref } = renderSheet();
    act(() => ref.current?.present());
    fireOpened();
    act(() => ref.current?.present());
    expect(mockModal.present).toHaveBeenCalledTimes(1);
  });

  it('swallows Android hardware back while open by dismissing the sheet', () => {
    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    const listeners: (() => boolean)[] = [];
    const remove = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((
      _event: string,
      handler: () => boolean,
    ) => {
      listeners.push(handler);
      return { remove };
    }) as typeof BackHandler.addEventListener);

    const { ref } = renderSheet();
    act(() => ref.current?.present());
    expect(listeners).toHaveLength(0);
    fireOpened();
    expect(listeners).toHaveLength(1);

    expect(listeners[0]()).toBe(true);
    expect(mockModal.dismiss).toHaveBeenCalledTimes(1);

    // Open state clears on the terminal onDismiss, releasing the listener.
    fireDismissed();
    expect(remove).toHaveBeenCalled();
    osSpy.restore();
  });
});
