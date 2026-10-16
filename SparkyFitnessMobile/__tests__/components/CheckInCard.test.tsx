import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CheckInCard from '../../src/components/recording/CheckInCard';
import { initializeI18n } from '../../src/localization/i18n';

beforeAll(async () => {
  await initializeI18n('en');
});

test('offers off, 5, 10 and 15 minutes and reports the choice', () => {
  const onChange = jest.fn();
  render(<CheckInCard minutes={0} onChange={onChange} />);
  expect(screen.getByText('Spoken updates')).toBeTruthy();
  expect(screen.getByText('Off')).toBeTruthy();
  expect(screen.getByText('5 min')).toBeTruthy();
  expect(screen.getByText('15 min')).toBeTruthy();
  fireEvent.press(screen.getByText('10 min'));
  expect(onChange).toHaveBeenCalledWith(10);
});
