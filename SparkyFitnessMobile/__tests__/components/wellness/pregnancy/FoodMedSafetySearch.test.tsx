import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import FoodMedSafetySearch from '../../../../src/components/wellness/pregnancy/FoodMedSafetySearch';

describe('FoodMedSafetySearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows a hint when the query is empty', () => {
    const { getByText } = render(<FoodMedSafetySearch />);
    expect(getByText("Search to see how a food or medication is commonly categorized during pregnancy.")).toBeTruthy();
  });

  it('finds a known food item and shows its status', async () => {
    const { getByPlaceholderText, getByText } = render(<FoodMedSafetySearch />);
    fireEvent.changeText(getByPlaceholderText('Sushi'), 'sushi');

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(getByText('Sushi (raw)')).toBeTruthy();
    expect(getByText('Avoid')).toBeTruthy();
  });

  it('switches to medications and finds a known med', async () => {
    const { getByText, getByPlaceholderText } = render(<FoodMedSafetySearch />);
    fireEvent.press(getByText('Medications'));
    // "ibuprofen" also substring-matches "Ibuprofen gel" — both are 'caution',
    // so just assert the specific item we care about renders.
    fireEvent.changeText(getByPlaceholderText('Ibuprofen'), 'Ibuprofen (Advil)');

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(getByText('Ibuprofen (Advil)')).toBeTruthy();
    expect(getByText('Caution')).toBeTruthy();
  });

  it('shows a not-found message for no matches', async () => {
    const { getByPlaceholderText, getByText } = render(<FoodMedSafetySearch />);
    fireEvent.changeText(getByPlaceholderText('Sushi'), 'zzzznotfound');

    await act(async () => {
      jest.advanceTimersByTime(250);
    });

    expect(getByText(/No match found/)).toBeTruthy();
  });
});
