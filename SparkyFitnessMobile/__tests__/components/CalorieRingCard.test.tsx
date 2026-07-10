import React from 'react';
import { render } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import CalorieRingCard from '../../src/components/CalorieRingCard';

jest.mock('../../src/components/ProgressRing', () => {
  const React = require('react');
  const { View } = require('react-native');

  return (props: Record<string, unknown>) =>
    React.createElement(View, { ...props, testID: 'progress-ring' });
});

describe('CalorieRingCard', () => {
  it('renders Saudi Arabic labels and numerals', () => {
    const screen = render(
      <NavigationContainer>
        <CalorieRingCard
          caloriesConsumed={1234}
          caloriesBurned={350}
          calorieGoal={2000}
          remainingCalories={1116}
          progressPercent={0.617}
        />
      </NavigationContainer>,
    );

    expect(screen.getByText('المستهلك')).toBeTruthy();
    expect(screen.getByText('١٬٢٣٤')).toBeTruthy();
    expect(screen.getByText('المحروق')).toBeTruthy();
    expect(screen.getByText('المتبقي')).toBeTruthy();
    expect(screen.getByText('من هدف ٢٬٠٠٠ سعرة')).toBeTruthy();
  });
});
