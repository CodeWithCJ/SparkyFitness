import React from 'react';
import { Platform, View } from 'react-native';
import { render } from '@testing-library/react-native';

import { useScreenHeader } from '../../src/hooks/useScreenHeader';
import { __resetAppPreferencesStoreForTests } from '../../src/stores/appPreferencesStore';
import i18n, { initializeI18n } from '../../src/localization/i18n';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockNavigation = {
  goBack: jest.fn(),
  setOptions: jest.fn(),
} as never;

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => mockUsesNativeHeader,
  useNativeIOSTabsActive: () => false,
}));

let mockUsesNativeHeader = false;

function TestScreen({
  right,
  left,
  title = 'Test',
}: {
  right?: Parameters<typeof useScreenHeader>[0]['right'];
  left?: Parameters<typeof useScreenHeader>[0]['left'];
  title?: string;
}) {
  const header = useScreenHeader({
    title,
    left,
    right: right ?? [{ kind: 'primary', onPress: () => {} }],
  });
  return <>{header}</>;
}

const primaryNoLabel = [{ kind: 'primary' as const, onPress: () => {} }];

// Busy without an explicit busyLabel: the header falls back to the localized
// common.saving value, and the custom bar swaps the text for an ActivityIndicator.
const primaryBusy = [
  {
    kind: 'primary' as const,
    busy: true,
    onPress: () => {},
  },
];

const primaryExplicitA11y = [
  {
    kind: 'primary' as const,
    label: 'Save',
    accessibilityLabel: 'Save meal',
    onPress: () => {},
  },
];

describe('useScreenHeader accessibility label (custom path)', () => {
  let osSpy: jest.SpyInstance | null = null;

  beforeEach(async () => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockUsesNativeHeader = false;
    osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    if (osSpy) osSpy.restore();
  });

  it('English: default primary action shows Save and announces Save', async () => {
    const { getByText, getByRole } = render(<TestScreen right={primaryNoLabel} />);

    expect(getByText('Save')).toBeTruthy();
    expect(getByRole('button').props.accessibilityLabel).toBe('Save');
  });

  it('Polish: default primary action shows Zapisz and announces Zapisz', async () => {
    await i18n.changeLanguage('pl');

    const { getByText, getByRole } = render(<TestScreen right={primaryNoLabel} />);

    expect(getByText('Zapisz')).toBeTruthy();
    expect(getByRole('button').props.accessibilityLabel).toBe('Zapisz');
  });

  it('busy disables the button without desynchronizing the label', async () => {
    const { getByRole, queryByText } = render(<TestScreen right={primaryBusy} />);

    const button = getByRole('button');
    // The custom bar swaps the text for a spinner while busy.
    expect(queryByText('Save')).toBeNull();
    expect(button.props.accessibilityLabel).toBe('Save');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('Polish busy keeps the announced label in Polish', async () => {
    await i18n.changeLanguage('pl');

    const { getByRole } = render(<TestScreen right={primaryBusy} />);

    const button = getByRole('button');
    expect(button.props.accessibilityLabel).toBe('Zapisz');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('explicit accessibilityLabel wins over the visible label', async () => {
    const { getByRole } = render(<TestScreen right={primaryExplicitA11y} />);

    expect(getByRole('button').props.accessibilityLabel).toBe('Save meal');
  });
});

describe('useScreenHeader custom bar title layout', () => {
  let osSpy: jest.SpyInstance | null = null;

  beforeEach(async () => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockUsesNativeHeader = false;
    osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    if (osSpy) osSpy.restore();
  });

  // Confirmed via onLayout measurement on a real device (row:411 L:0 T:379
  // R:0): a `flex-1` (flexBasis: 0%) side cell next to a flexShrink-only
  // (flexBasis: auto/content) title gets ZERO share of both the shrink
  // distribution (scaled shrink factor = flexShrink × flexBasis = 0 for
  // basis:0% items) and the growth (growth doesn't apply during overflow) —
  // a long title claims the entire row and the side cells vanish. Fixed via
  // an absolutely-positioned title layer (decoupled from the side cells'
  // flex layout entirely, so it can never compete with them for space) plus
  // content-sized (flexShrink: 0) side cells, so neither a long title nor
  // wide side content can squeeze the other. Asserts the inline `style` (not
  // a className string) since Uniwind's classes are processed at build time
  // and are opaque to this test either way — the inline style is what
  // actually guarantees the behavior at runtime.
  it('renders the title as an untouchable absolute layer and keeps the side cells content-sized, so a long title cannot squeeze them to zero', () => {
    const { UNSAFE_getAllByType } = render(
      <TestScreen title={'A very long preset name that would otherwise overflow the header bar'} />,
    );

    const views = UNSAFE_getAllByType(View);
    const titleLayer = views.find((view) => view.props.pointerEvents === 'box-none');
    expect(titleLayer?.props.style).toEqual(
      expect.objectContaining({ position: 'absolute', left: 16, right: 16 }),
    );
    expect(titleLayer?.props.children.props.children).toBe(
      'A very long preset name that would otherwise overflow the header bar',
    );

    const leftContainer = views.find(
      (view) => view.props.className === 'flex-row items-center gap-4',
    );
    expect(leftContainer?.props.style).toEqual(expect.objectContaining({ flexShrink: 0 }));

    const rightContainer = views.find(
      (view) => view.props.className === 'flex-row items-center justify-end gap-4',
    );
    expect(rightContainer?.props.style).toEqual(expect.objectContaining({ flexShrink: 0 }));
  });
});

describe('useScreenHeader accessibility label (native path)', () => {
  let osSpy: jest.SpyInstance | null = null;

  beforeEach(async () => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockUsesNativeHeader = true;
    osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    if (osSpy) osSpy.restore();
  });

  function nativeRightItem() {
    const calls = (mockNavigation as unknown as { setOptions: jest.Mock }).setOptions.mock.calls;
    const options = calls[calls.length - 1][0] as {
      unstable_headerRightItems?: () => unknown[];
    };
    const items = options.unstable_headerRightItems?.() ?? [];
    return items[0] as { label?: string; accessibilityLabel?: string } | undefined;
  }

  function nativeLeftItem() {
    const calls = (mockNavigation as unknown as { setOptions: jest.Mock }).setOptions.mock.calls;
    const options = calls[calls.length - 1][0] as {
      unstable_headerLeftItems?: () => unknown[];
    };
    const items = options.unstable_headerLeftItems?.() ?? [];
    return items[0] as { label?: string; accessibilityLabel?: string } | undefined;
  }

  it('English busy: native label is Saving… and accessibility mirrors it', async () => {
    render(<TestScreen right={primaryBusy} />);

    const item = nativeRightItem();
    expect(item?.label).toBe('Saving…');
    expect(item?.accessibilityLabel).toBe('Saving…');
  });

  it('Polish busy: native label is Zapisywanie… and accessibility mirrors it', async () => {
    await i18n.changeLanguage('pl');

    render(<TestScreen right={primaryBusy} />);

    const item = nativeRightItem();
    expect(item?.label).toBe('Zapisywanie…');
    expect(item?.accessibilityLabel).toBe('Zapisywanie…');
  });

  it('explicit accessibilityLabel wins on the native path too', async () => {
    render(<TestScreen right={primaryExplicitA11y} />);

    const item = nativeRightItem();
    expect(item?.label).toBe('Save');
    expect(item?.accessibilityLabel).toBe('Save meal');
  });

  it('fires the registered handler from the native press path', async () => {
    const onPress = jest.fn();
    render(<TestScreen right={[{ kind: 'primary', label: 'Save', onPress }]} />);

    const item = nativeRightItem();
    item?.onPress?.();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('rebuilds a localized left primary item after a language change', async () => {
    const onPress = jest.fn();
    const { rerender } = render(<TestScreen right={[]} left={{ kind: 'primary', onPress }} />);

    let item = nativeLeftItem();
    expect(item?.label).toBe('Save');
    expect(item?.accessibilityLabel).toBe('Save');

    await i18n.changeLanguage('pl');
    rerender(<TestScreen right={[]} left={{ kind: 'primary', onPress }} />);

    item = nativeLeftItem();
    expect(item?.label).toBe('Zapisz');
    expect(item?.accessibilityLabel).toBe('Zapisz');
  });

  it('rebuilds the localized left busy label after a language change', async () => {
    const onPress = jest.fn();
    const { rerender } = render(<TestScreen right={[]} left={{ kind: 'primary', busy: true, onPress }} />);

    let item = nativeLeftItem();
    expect(item?.label).toBe('Saving…');
    expect(item?.accessibilityLabel).toBe('Saving…');

    await i18n.changeLanguage('pl');
    rerender(<TestScreen right={[]} left={{ kind: 'primary', busy: true, onPress }} />);

    item = nativeLeftItem();
    expect(item?.label).toBe('Zapisywanie…');
    expect(item?.accessibilityLabel).toBe('Zapisywanie…');
  });

  it('an explicit accessibilityLabel wins on the native left path too', async () => {
    render(
      <TestScreen
        right={[]}
        left={{
          kind: 'primary',
          label: 'Save',
          accessibilityLabel: 'Save meal',
          onPress: () => {},
        }}
      />,
    );

    const item = nativeLeftItem();
    expect(item?.label).toBe('Save');
    expect(item?.accessibilityLabel).toBe('Save meal');
  });
});
