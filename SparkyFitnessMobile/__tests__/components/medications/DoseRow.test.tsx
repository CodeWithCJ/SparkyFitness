import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import DoseRow from '../../../src/components/medications/DoseRow';

describe('DoseRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('scheduled, inline actions', () => {
    it('shows Take and Skip for a pending dose and forwards presses', () => {
      const onTake = jest.fn();
      const onSkip = jest.fn();
      const screen = render(
        <DoseRow
          kind="scheduled"
          status="pending"
          onToggle={jest.fn()}
          onTake={onTake}
          onSkip={onSkip}
          title="8:00 AM"
          subtitle="1 tablet"
          actionsStyle="inline"
        />,
      );

      expect(screen.getByText('8:00 AM')).toBeTruthy();
      expect(screen.getByText('1 tablet')).toBeTruthy();
      fireEvent.press(screen.getByText('Take'));
      expect(onTake).toHaveBeenCalled();
      fireEvent.press(screen.getByText('Skip'));
      expect(onSkip).toHaveBeenCalled();
    });

    it('toggles via the status circle', () => {
      const onToggle = jest.fn();
      const screen = render(
        <DoseRow
          kind="scheduled"
          status="pending"
          onToggle={onToggle}
          onTake={jest.fn()}
          onSkip={jest.fn()}
          title="8:00 AM"
          actionsStyle="inline"
        />,
      );

      fireEvent.press(screen.getByLabelText('Mark 8:00 AM taken'));
      expect(onToggle).toHaveBeenCalled();
    });

    it('shows a Taken state instead of buttons once logged', () => {
      const screen = render(
        <DoseRow
          kind="scheduled"
          status="taken"
          onToggle={jest.fn()}
          onTake={jest.fn()}
          onSkip={jest.fn()}
          title="8:00 AM"
          actionsStyle="inline"
        />,
      );

      expect(screen.getByText('Taken')).toBeTruthy();
      expect(screen.queryByText('Take')).toBeNull();
      expect(screen.queryByText('Skip')).toBeNull();
    });

    it('shows a Skipped state', () => {
      const screen = render(
        <DoseRow
          kind="scheduled"
          status="skipped"
          onToggle={jest.fn()}
          onTake={jest.fn()}
          onSkip={jest.fn()}
          title="8:00 AM"
          actionsStyle="inline"
        />,
      );

      expect(screen.getByText('Skipped')).toBeTruthy();
    });
  });

  describe('scheduled, swipe actions', () => {
    it('reveals Take and Skip as swipe actions', () => {
      const onTake = jest.fn();
      const onSkip = jest.fn();
      const screen = render(
        <DoseRow
          kind="scheduled"
          status="pending"
          onToggle={jest.fn()}
          onTake={onTake}
          onSkip={onSkip}
          title="Lisinopril"
          actionsStyle="swipe"
        />,
      );

      const actions = within(screen.getByTestId('swipeable-right-actions'));
      fireEvent.press(actions.getByText('Take'));
      expect(onTake).toHaveBeenCalled();
      fireEvent.press(actions.getByText('Skip'));
      expect(onSkip).toHaveBeenCalled();
    });
  });

  describe('prn', () => {
    it('logs from the circle and shows the day count', () => {
      const onLog = jest.fn();
      const screen = render(
        <DoseRow
          kind="prn"
          count={2}
          onLog={onLog}
          onUndoLast={jest.fn()}
          title="Ibuprofen"
          subtitle="As needed"
          actionsStyle="swipe"
        />,
      );

      expect(screen.getByText('2')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Log Ibuprofen'));
      expect(onLog).toHaveBeenCalled();
    });

    it('offers Log and Undo swipe actions once doses are logged', () => {
      const onLog = jest.fn();
      const onUndoLast = jest.fn();
      const screen = render(
        <DoseRow
          kind="prn"
          count={1}
          onLog={onLog}
          onUndoLast={onUndoLast}
          title="Ibuprofen"
          actionsStyle="swipe"
        />,
      );

      const actions = within(screen.getByTestId('swipeable-right-actions'));
      fireEvent.press(actions.getByText('Log'));
      expect(onLog).toHaveBeenCalled();
      fireEvent.press(actions.getByText('Undo'));
      expect(onUndoLast).toHaveBeenCalled();
    });

    it('hides the Undo swipe action when nothing is logged', () => {
      const screen = render(
        <DoseRow
          kind="prn"
          count={0}
          onLog={jest.fn()}
          onUndoLast={jest.fn()}
          title="Ibuprofen"
          actionsStyle="swipe"
        />,
      );

      const actions = within(screen.getByTestId('swipeable-right-actions'));
      expect(actions.queryByText('Undo')).toBeNull();
    });

    it('shows an inline Log button', () => {
      const onLog = jest.fn();
      const screen = render(
        <DoseRow
          kind="prn"
          count={0}
          onLog={onLog}
          onUndoLast={jest.fn()}
          title="Ibuprofen"
          actionsStyle="inline"
        />,
      );

      fireEvent.press(screen.getByText('Log'));
      expect(onLog).toHaveBeenCalled();
    });
  });

  it('navigates from a row press when onPress is provided', () => {
    const onPress = jest.fn();
    const screen = render(
      <DoseRow
        kind="scheduled"
        status="pending"
        onToggle={jest.fn()}
        onTake={jest.fn()}
        onSkip={jest.fn()}
        title="Lisinopril"
        onPress={onPress}
        actionsStyle="swipe"
      />,
    );

    fireEvent.press(screen.getByText('Lisinopril'));
    expect(onPress).toHaveBeenCalled();
  });
});
