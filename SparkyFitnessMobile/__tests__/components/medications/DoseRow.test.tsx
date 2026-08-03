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
      fireEvent.press(screen.getByText('Log'));
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
      expect(screen.queryByText('Log')).toBeNull();
      expect(screen.queryByText('Skip')).toBeNull();
      // Hidden sizer keeps the actions column at the Log/Skip pair width.
      expect(screen.getByText('Log', { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByText('Skip', { includeHiddenElements: true })).toBeTruthy();
      expect(screen.getByText('8:00 AM').props.className).toContain('text-text-secondary');
      expect(screen.getByText('8:00 AM').props.className).toContain('line-through');
    });

    it('emphasizes the time ahead of the subtitle', () => {
      const screen = render(
        <DoseRow
          kind="scheduled"
          status="pending"
          onToggle={jest.fn()}
          onTake={jest.fn()}
          onSkip={jest.fn()}
          title="Metformin"
          time="8:00 AM"
          subtitle="Tablet · 500 mg"
        />,
      );

      const time = screen.getByText('8:00 AM');
      expect(time.props.className).toContain('text-text-primary');
      expect(screen.getByText('8:00 AM · Tablet · 500 mg', { exact: false })).toBeTruthy();
    });

    it('mutes the time once the dose is logged', () => {
      const screen = render(
        <DoseRow
          kind="scheduled"
          status="taken"
          onToggle={jest.fn()}
          onTake={jest.fn()}
          onSkip={jest.fn()}
          title="Metformin"
          time="8:00 AM"
          subtitle="Tablet · 500 mg"
        />,
      );

      const time = screen.getByText('8:00 AM');
      expect(time.props.className).toContain('text-text-muted');
      expect(time.props.className).not.toContain('text-text-primary');
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

    it('logs from the Log button', () => {
      const onLog = jest.fn();
      const screen = render(<DoseRow kind="prn" count={0} onLog={onLog} title="Ibuprofen" />);

      fireEvent.press(screen.getByText('Log'));
      expect(onLog).toHaveBeenCalled();
    });

    it('keeps the title and subtitle unmuted after doses have been taken', () => {
      const screen = render(
        <DoseRow kind="prn" count={1} onLog={jest.fn()} title="Ibuprofen" subtitle="As needed" />,
      );

      const title = screen.getByText('Ibuprofen');
      expect(title.props.className).toContain('text-text-primary');
      expect(title.props.className).not.toContain('text-text-muted');
      const subtitle = screen.getByText('As needed');
      expect(subtitle.props.className).toContain('text-text-secondary');
      expect(subtitle.props.className).not.toContain('text-text-muted');
    });

    it('centers the Take button in the pair-width actions column', () => {
      const screen = render(<DoseRow kind="prn" count={0} onLog={jest.fn()} title="Ibuprofen" />);

      // Hidden sizer keeps the column at the Take/Skip pair width.
      expect(screen.queryByText('Skip')).toBeNull();
      expect(screen.getByText('Skip', { includeHiddenElements: true })).toBeTruthy();
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
