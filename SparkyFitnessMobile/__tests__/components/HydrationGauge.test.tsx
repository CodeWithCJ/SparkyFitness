import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
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

// #2115: the gauge used to tell the user to configure a container "on server"
// and leave it at that -- a dead sentence beside inert +/- buttons, from before
// the mobile Water Containers screen existed.
describe('HydrationGauge press caption', () => {
  const noop = () => {};

  it('offers a way to the container screen when there is nothing to press', () => {
    const onConfigure = jest.fn();
    render(
      <HydrationGauge
        consumed={0}
        goal={2000}
        onIncrement={noop}
        onConfigure={onConfigure}
      />
    );

    const prompt = screen.getByText(
      'Choose a water container to enable quick add/remove'
    );
    fireEvent.press(prompt);
    expect(onConfigure).toHaveBeenCalled();
  });

  it('states what one press logs when the container is linked to a food', () => {
    render(
      <HydrationGauge
        consumed={0}
        goal={2000}
        onIncrement={noop}
        // A linked container has no millilitre figure of its own.
        containerVolume={null}
        linkedPressLabel="250 ml · Ice Coffe"
      />
    );

    expect(screen.getByText('250 ml · Ice Coffe')).toBeTruthy();
    expect(screen.queryByText(/Choose a water container/)).toBeNull();
  });

  it('still states the millilitres per press for a plain container', () => {
    render(
      <HydrationGauge
        consumed={0}
        goal={2000}
        unit="ml"
        onIncrement={noop}
        containerVolume={500}
      />
    );

    expect(screen.getByText('500 ml per container')).toBeTruthy();
    expect(screen.queryByText(/Choose a water container/)).toBeNull();
  });
});
