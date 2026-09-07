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

  // The amount was two different muted captions -- "N ml per container" for a
  // plain container, the drink name for a linked one -- either of which was the
  // least readable thing on a card whose whole purpose is that number.
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

    expect(screen.getByText('500 ml')).toBeTruthy();
    expect(screen.queryByText(/Choose a water container/)).toBeNull();
  });

  // Tapping a preset used to select it and log nothing, because mobile put
  // vessels and drinks in one selectable row.
  it('logs a preset on tap rather than selecting it', () => {
    const onQuickAdd = jest.fn();
    const onSelectContainer = jest.fn();
    render(
      <HydrationGauge
        consumed={0}
        goal={2000}
        unit="ml"
        onIncrement={noop}
        containerVolume={250}
        onSelectContainer={onSelectContainer}
        onQuickAdd={onQuickAdd}
        quickAddPresets={[{ id: 7, name: 'Latte', pressLabel: '350 ml' }]}
      />
    );

    fireEvent.press(screen.getByLabelText('Log Latte'));

    expect(onQuickAdd).toHaveBeenCalledWith(7);
    expect(onSelectContainer).not.toHaveBeenCalled();
  });

  it('states what one tap of a preset logs', () => {
    render(
      <HydrationGauge
        consumed={0}
        goal={2000}
        unit="ml"
        onIncrement={noop}
        containerVolume={250}
        onQuickAdd={noop}
        quickAddPresets={[{ id: 7, name: 'Latte', pressLabel: '350 ml' }]}
      />
    );

    expect(screen.getByText('Latte')).toBeTruthy();
    expect(screen.getByText('350 ml')).toBeTruthy();
  });

  // A container linked to a food carries no volume of its own -- the credit is
  // the food's water times the hydration factor -- so keying the buttons off
  // containerVolume left a selected container unpressable.
  it('lets a linked container be pressed even though it has no volume', () => {
    const onIncrement = jest.fn();
    render(
      <HydrationGauge
        consumed={0}
        goal={2000}
        unit="ml"
        onIncrement={onIncrement}
        containerVolume={undefined}
        linkedPressLabel="200 ml · Ice Coffe"
      />
    );

    fireEvent.press(screen.getByLabelText('Add water'));

    expect(onIncrement).toHaveBeenCalled();
    expect(screen.getByText('200 ml · Ice Coffe')).toBeTruthy();
  });

  it('still disables the buttons when there is nothing to press', () => {
    const onIncrement = jest.fn();
    render(
      <HydrationGauge
        consumed={0}
        goal={2000}
        unit="ml"
        onIncrement={onIncrement}
        containerVolume={undefined}
      />
    );

    fireEvent.press(screen.getByLabelText('Add water'));
    expect(onIncrement).not.toHaveBeenCalled();
  });
});
