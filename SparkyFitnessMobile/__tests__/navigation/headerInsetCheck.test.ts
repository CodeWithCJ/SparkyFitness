import { checkHeaderInsets } from '../helpers/headerInsetCheck';

/** A pushed screen whose body (the statements after the hooks) is given. */
function screen(body: string, after = ''): string {
  return `
import React from 'react';
import { FlatList, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';

const Screen = ({ loading }: { loading: boolean }) => {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const header = useScreenHeader({ title: 'Title', left: { kind: 'back' } });
  ${body}
};
${after}
export default Screen;
`;
}

const PADDED =
  'style={usesNativeHeader ? undefined : { paddingTop: insets.top }}';

function problemsOf(source: string, headerPropNames?: string[]): string[] {
  return checkHeaderInsets('Screen.tsx', source, {
    headerPropNames,
  }).problems.map(({ line, message }) =>
    line === null ? message : `${line}: ${message}`
  );
}

describe('checkHeaderInsets', () => {
  it('accepts a root padded on the custom-header path', () => {
    expect(
      problemsOf(screen(`return (<View ${PADDED}>{header}<Text /></View>);`))
    ).toEqual([]);
  });

  it('accepts Android-only padding, the modal-route pattern', () => {
    expect(
      problemsOf(
        screen(
          `return (<View style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>{header}</View>);`
        )
      )
    ).toEqual([]);
  });

  it('rejects a bare fragment', () => {
    expect(problemsOf(screen('return (<>{header}<Text /></>);'))).toEqual([
      expect.stringContaining('not inside an element padded'),
    ]);
  });

  it('checks every return: a loading return without the inset fails', () => {
    const problems = problemsOf(
      screen(`
  if (loading) {
    return (<View className="flex-1">{header}</View>);
  }
  return (<View ${PADDED}>{header}</View>);`)
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/not inside an element padded/);
  });

  it('rejects the inset applied on the native-header branch', () => {
    expect(
      problemsOf(
        screen(
          'return (<View style={usesNativeHeader ? { paddingTop: insets.top } : undefined}>{header}</View>);'
        )
      )
    ).toEqual([expect.stringContaining('native-header path instead')]);
  });

  it('follows a style kept in a constant, and inside a style array', () => {
    for (const style of ['style={rootStyle}', 'style={[rootStyle]}']) {
      expect(
        problemsOf(
          screen(`
  const rootStyle = usesNativeHeader ? undefined : { paddingTop: insets.top };
  return (<View ${style}>{header}</View>);`)
        )
      ).toEqual([]);
    }
  });

  it('resolves style constants lexically, not by name', () => {
    expect(
      problemsOf(
        screen(
          `
  const containerStyle = { flex: 1 };
  return (<View style={containerStyle}>{header}</View>);`,
          `
const Helper = () => {
  const insets = useSafeAreaInsets();
  const containerStyle = { paddingTop: insets.top };
  return <View style={containerStyle} />;
};`
        )
      )
    ).toEqual([expect.stringContaining('not inside an element padded')]);
  });

  it('lets a later paddingTop in a style array win', () => {
    expect(
      problemsOf(
        screen(`
  const rootStyle = { paddingTop: insets.top };
  return (<View style={[rootStyle, { paddingTop: 0 }]}>{header}</View>);`)
      )
    ).toEqual([expect.stringContaining('not inside an element padded')]);
    expect(
      problemsOf(
        screen(
          'return (<View style={[{ paddingTop: 0 }, { paddingTop: insets.top }]}>{header}</View>);'
        )
      )
    ).toEqual([]);
  });

  it('rejects padding behind a condition it cannot read', () => {
    expect(
      problemsOf(
        screen(
          'return (<View style={loading ? undefined : { paddingTop: insets.top }}>{header}</View>);'
        )
      )
    ).toEqual([expect.stringContaining('cannot read')]);
  });

  it('reads a condition kept in a constant', () => {
    expect(
      problemsOf(
        screen(`
  const needsTopInset = !usesNativeHeader && (!loading || Platform.OS === 'android');
  return (<View style={needsTopInset ? { paddingTop: insets.top } : undefined}>{header}</View>);`)
      )
    ).toEqual([]);
  });

  it('checks a bar rendered through && or a ternary', () => {
    expect(
      problemsOf(screen('return (<>{!usesNativeHeader && header}</>);'))
    ).toEqual([expect.stringContaining('not inside an element padded')]);
    expect(
      problemsOf(screen('return (<>{usesNativeHeader ? null : header}</>);'))
    ).toEqual([expect.stringContaining('not inside an element padded')]);
    expect(
      problemsOf(
        screen(`return (<View ${PADDED}>{!usesNativeHeader && header}</View>);`)
      )
    ).toEqual([]);
  });

  it('rejects a bar rendered only on the native-header path', () => {
    expect(
      problemsOf(
        screen('return (<View>{usesNativeHeader ? header : null}</View>);')
      )
    ).toEqual([
      expect.stringContaining('only rendered where the native header'),
    ]);
  });

  it('accepts a bar passed to a component inside a padded element or to a layout', () => {
    expect(
      problemsOf(
        screen(`return (<View ${PADDED}><Panel header={header} /></View>);`)
      )
    ).toEqual([]);
    expect(
      problemsOf(screen('return (<ReportScreenLayout header={header} />);'))
    ).toEqual([]);
    expect(problemsOf(screen('return (<Panel header={header} />);'))).toEqual([
      expect.stringContaining('not inside an element padded'),
    ]);
  });

  it('follows JSX kept in a variable, past a native-header early return', () => {
    expect(
      problemsOf(
        screen(`
  const content = (<>{header}<Text /></>);
  if (usesNativeHeader) return content;
  return (<View style={{ paddingTop: insets.top }}>{content}</View>);`)
      )
    ).toEqual([]);
  });

  it('follows render helpers and inline render props', () => {
    expect(
      problemsOf(
        screen(`
  const renderTop = () => <>{header}</>;
  return (<View ${PADDED}>{renderTop()}</View>);`)
      )
    ).toEqual([]);
    expect(
      problemsOf(
        screen(
          `return (<View ${PADDED}><FlatList data={[]} renderItem={null} ListHeaderComponent={() => <>{header}</>} /></View>);`
        )
      )
    ).toEqual([]);
  });

  it('checks a layout that renders the bar it gets as a prop', () => {
    const layout = (style: string) => `
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';

export function Layout({ header }: { header: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  return (<View ${style}>{header}</View>);
}
`;
    expect(problemsOf(layout(PADDED), ['header'])).toEqual([]);
    expect(problemsOf(layout('className="flex-1"'), ['header'])).toEqual([
      expect.stringContaining('not inside an element padded'),
    ]);
  });
});
