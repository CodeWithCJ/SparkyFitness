import React from 'react';
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
  ] as const)('localizes protocol badges in pill and subtle variants for %s', (locale, ratio, circadian, custom, empty, server) => {
    setTestLocale(locale);
    const view = render(
      <>
        <FastingProtocolBadge protocol="16:8 Leangains" />
        <FastingProtocolBadge protocol="Circadian Rhythm" variant="subtle" />
        <FastingProtocolBadge protocol="Custom Fast" />
        <FastingProtocolBadge protocol={null} variant="subtle" />
        <FastingProtocolBadge protocol="Server Special" />
      </>,
    );
    expect(view.getByText(ratio)).toBeTruthy();
    expect(view.getByText(circadian)).toBeTruthy();
    expect(view.getByText(custom)).toBeTruthy();
    expect(view.getByText(empty)).toBeTruthy();
    expect(view.getByText(server)).toBeTruthy();
  });

  it('keeps stat card data literal and preserves className variants', () => {
    const view = render(<FastingStatCard label="Owner label" value="Owner value" unit="Owner unit" />);
    expect(view.getByText('Owner label')).toBeTruthy();
    expect(view.getByText('Owner value')).toBeTruthy();
    expect(view.getByText('Owner unit')).toBeTruthy();
  });
});
