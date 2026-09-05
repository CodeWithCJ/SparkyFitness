import React from 'react';
import { render, screen } from '@testing-library/react-native';
import HydrationGauge from '../../src/components/HydrationGauge';

// #1557, #1629: fromFoodMl renders a muted caption only when the user has
// opted in to add_food_water_to_intake (server-side) and it produced a
// non-zero value -- 0/undefined must render nothing extra.
describe('HydrationGauge fromFoodMl caption', () => {
  it('renders no "from food" caption when fromFoodMl is absent', () => {
    render(<HydrationGauge consumed={500} goal={2000} />);
    expect(screen.queryByText(/from food/i)).toBeNull();
  });

  it('renders no "from food" caption when fromFoodMl is 0', () => {
    render(<HydrationGauge consumed={500} goal={2000} fromFoodMl={0} />);
    expect(screen.queryByText(/from food/i)).toBeNull();
  });

  it('renders the "from food" caption with the converted value when fromFoodMl > 0', () => {
    render(
      <HydrationGauge consumed={750} goal={2000} fromFoodMl={250} unit="ml" />
    );
    expect(screen.getByText('Includes 250 ml from food')).toBeTruthy();
  });

  it('converts fromFoodMl into the display unit like the rest of the gauge', () => {
    render(
      <HydrationGauge
        consumed={750}
        goal={2000}
        fromFoodMl={295.735}
        unit="oz"
      />
    );
    // 295.735 ml -> 10.0 fl oz, 1 decimal for 'oz' (see formatUnitVolume).
    expect(screen.getByText('Includes 10 oz from food')).toBeTruthy();
  });
});
