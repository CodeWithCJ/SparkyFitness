import React from 'react';
import { render } from '@testing-library/react-native';
import EquivalentsSection from '../../src/components/EquivalentsSection';
import type { EquivalentUnit } from '../../src/types/foodUnitVariants';

function setTestLocale(locale: 'en' | 'pl'): void {
  (
    globalThis as typeof globalThis & {
      __setTestLocale: (value: 'en' | 'pl') => void;
    }
  ).__setTestLocale(locale);
}

const items: EquivalentUnit[] = [
  { id: 'eq-1', serving_size: 100, serving_unit: 'g' },
];

const renderSection = () =>
  render(
    <EquivalentsSection
      items={items}
      onChange={jest.fn()}
      textMuted="#888"
      accentColor="#3B82F6"
    />,
  );

describe('EquivalentsSection', () => {
  afterEach(() => {
    setTestLocale('en');
  });

  it('renders EN labels and remove accessibility label', () => {
    setTestLocale('en');
    const view = renderSection();

    expect(view.getByText('Equivalent sizes')).toBeTruthy();
    expect(view.getByText('+ Add equivalent')).toBeTruthy();
    expect(view.getByLabelText('Remove equivalent')).toBeTruthy();
  });

  it('renders PL labels and remove accessibility label', () => {
    setTestLocale('pl');
    const view = renderSection();

    expect(view.getByText('Równoważne rozmiary')).toBeTruthy();
    expect(view.getByText('+ Dodaj odpowiednik')).toBeTruthy();
    expect(view.getByLabelText('Usuń odpowiednik')).toBeTruthy();
  });
});
