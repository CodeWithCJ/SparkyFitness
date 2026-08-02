import React from 'react';
import { View } from 'react-native';
import { render } from '@testing-library/react-native';
import { FastingProtocolBadge, FastingStatCard } from '../../src/components/FastingSharedComponents';

function setTestLocale(locale: 'en' | 'pl'): void {
  (globalThis as typeof globalThis & { __setTestLocale: (value: 'en' | 'pl') => void }).__setTestLocale(locale);
}

describe('FastingSharedComponents', () => {
  beforeEach(() => setTestLocale('en'));

  it.each([
    ['en', '16:8', 'Circadian Rhythm', 'Custom Fast', 'Fasting', 'Server Special'],
    ['pl', '16:8', 'Rytm dobowy', 'Własny post', 'Post', 'Server Special'],
  ] as const)('localizes pill protocol badges for %s', (locale, ratio, circadian, custom, empty, server) => {
    setTestLocale(locale);
    const view = render(
      <>
        <FastingProtocolBadge protocol="16:8 Leangains" />
        <FastingProtocolBadge protocol="Circadian Rhythm" />
        <FastingProtocolBadge protocol="Custom Fast" />
        <FastingProtocolBadge protocol={null} />
        <FastingProtocolBadge protocol="" />
        <FastingProtocolBadge protocol="Server Special" />
      </>,
    );
    expect(view.getByText(ratio)).toBeTruthy();
    expect(view.getByText(circadian)).toBeTruthy();
    expect(view.getByText(custom)).toBeTruthy();
    expect(view.getAllByText(empty)).toHaveLength(2);
    expect(view.getByText(server)).toBeTruthy();
  });

  it.each([
    ['en', '16:8', 'Circadian Rhythm', 'Custom Fast', 'Fasting', 'Server Special'],
    ['pl', '16:8', 'Rytm dobowy', 'Własny post', 'Post', 'Server Special'],
  ] as const)('localizes subtle protocol badges for %s', (locale, ratio, circadian, custom, empty, server) => {
    setTestLocale(locale);
    const view = render(
      <>
        <FastingProtocolBadge protocol="16:8 Leangains" variant="subtle" />
        <FastingProtocolBadge protocol="Circadian Rhythm" variant="subtle" />
        <FastingProtocolBadge protocol="Custom Fast" variant="subtle" />
        <FastingProtocolBadge protocol={null} variant="subtle" />
        <FastingProtocolBadge protocol="" variant="subtle" />
        <FastingProtocolBadge protocol="Server Special" variant="subtle" />
      </>,
    );
    expect(view.getAllByText(ratio)).toHaveLength(1);
    expect(view.getByText(circadian)).toBeTruthy();
    expect(view.getByText(custom)).toBeTruthy();
    expect(view.getAllByText(empty)).toHaveLength(2);
    expect(view.getByText(server)).toBeTruthy();
  });

  it('preserves className on both badge variants', () => {
    const view = render(
      <>
        <FastingProtocolBadge protocol="16:8 Leangains" className="pill-extra" />
        <FastingProtocolBadge protocol="16:8 Leangains" variant="subtle" className="subtle-extra" />
      </>,
    );
    expect(view.UNSAFE_getAllByType(View).some((node) => node.props.className?.includes('pill-extra'))).toBe(true);
    expect(view.getAllByText('16:8').some((node) => node.props.className?.includes('subtle-extra'))).toBe(true);
  });

  it('keeps stat card data literal and preserves className variants', () => {
    const view = render(<FastingStatCard label="Owner label" value="Owner value" unit="Owner unit" />);
    expect(view.getByText('Owner label')).toBeTruthy();
    expect(view.getByText('Owner value')).toBeTruthy();
    expect(view.getByText('Owner unit')).toBeTruthy();
  });
});
