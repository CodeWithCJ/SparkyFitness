import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import DoseRow from '../../../src/components/medications/DoseRow';

describe('DoseRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('scheduled', () => {
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
        />,
      );

      expect(screen.getByText('Taken')).toBeTruthy();
      expect(screen.queryByText('Take')).toBeNull();
      expect(screen.queryByText('Skip')).toBeNull();
      expect(screen.getByText('8:00 AM').props.className).toContain('text-text-secondary');
      expect(screen.getByText('8:00 AM').props.className).toContain('line-through');
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
        />,
      );

      expect(screen.getByText('Skipped')).toBeTruthy();
      expect(screen.getByText('8:00 AM').props.className).not.toContain('line-through');
    });
  });

  describe('prn', () => {
    it('logs from the circle and shows the day count', () => {
      const onLog = jest.fn();
      const screen = render(
        <DoseRow kind="prn" count={2} onLog={onLog} title="Ibuprofen" subtitle="As needed" />,
      );

      expect(screen.getByText('2')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Log Ibuprofen'));
      expect(onLog).toHaveBeenCalled();
    });

    it('logs from the Take button', () => {
      const onLog = jest.fn();
      const screen = render(<DoseRow kind="prn" count={0} onLog={onLog} title="Ibuprofen" />);

      fireEvent.press(screen.getByText('Take'));
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
      />,
    );

    fireEvent.press(screen.getByText('Lisinopril'));
    expect(onPress).toHaveBeenCalled();
  });
});
