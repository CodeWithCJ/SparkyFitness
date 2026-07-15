import React from 'react';
import { render } from '@testing-library/react-native';
import MacroCard from '../../src/components/MacroCard';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

describe('MacroCard', () => {
  const baseProps = {
    label: 'Carbs',
    consumed: 50,
    goal: 200,
    color: '#00ff00',
    overfillColor: '#ff0000',
  };

  it('renders label and consumed/goal text', () => {
    const { getByText } = render(<MacroCard {...baseProps} />);
    expect(getByText('Carbs')).toBeTruthy();
    expect(getByText('50g / 200g')).toBeTruthy();
  });

  it('omits the goal suffix when no goal is provided', () => {
    const { getByText } = render(<MacroCard {...baseProps} goal={undefined} />);
    expect(getByText('50g')).toBeTruthy();
  });

  it('defaults to the 2-column width class when widthClassName is not provided', () => {
    const { toJSON } = render(<MacroCard {...baseProps} />);
    const root = toJSON() as { props: { className: string } };
    expect(root.props.className).toContain('w-[48%]');
  });

  it('applies a custom widthClassName when provided', () => {
    const { toJSON } = render(<MacroCard {...baseProps} widthClassName="w-[31%]" />);
    const root = toJSON() as { props: { className: string } };
    expect(root.props.className).toContain('w-[31%]');
  });

  it('does not shrink text by default (compact=false)', () => {
    const { getByText } = render(<MacroCard {...baseProps} />);
    expect(getByText('Carbs').props.className).toContain('text-sm');
  });

  it('shrinks label/value text when compact is true', () => {
    const { getByText } = render(<MacroCard {...baseProps} compact />);
    expect(getByText('Carbs').props.className).toContain('text-xs');
    expect(getByText('50g / 200g').props.className).toContain('text-[11px]');
  });
});
