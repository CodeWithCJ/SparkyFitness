import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrushingTimerDialog } from '@/pages/CheckIn/BrushingTimerDialog';
import { playIntervalCue } from '@/utils/workoutSounds';

jest.mock('@/utils/workoutSounds', () => ({ playIntervalCue: jest.fn() }));

const renderTimer = (onSave = jest.fn(async () => undefined)) => {
  const onOpenChange = jest.fn();
  render(
    <BrushingTimerDialog
      open
      targetSeconds={120}
      onOpenChange={onOpenChange}
      onSave={onSave}
    />
  );
  return { onSave, onOpenChange };
};

describe('BrushingTimerDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date('2026-11-08T08:00:00.000Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts down through the quarters with a chime at each and the finish chime at the target', () => {
    renderTimer();
    expect(screen.getByText('2:00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /start/i }));

    act(() => {
      jest.advanceTimersByTime(31_000);
    });
    expect(screen.getByText('Upper right')).toBeInTheDocument();
    expect(playIntervalCue).toHaveBeenLastCalledWith('rest');

    act(() => {
      jest.advanceTimersByTime(90_000);
    });
    expect(screen.getByText('Done! Save the brush')).toBeInTheDocument();
    expect(playIntervalCue).toHaveBeenLastCalledWith('finish');
    expect(playIntervalCue).toHaveBeenCalledTimes(4);
  });

  it('starts the ring full and drains it to empty at the target', () => {
    renderTimer();
    const ring = () =>
      Number(screen.getByTestId('timer-ring').getAttribute('data-progress'));
    expect(ring()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(ring()).toBe(0.5);
    act(() => {
      jest.advanceTimersByTime(70_000);
    });
    expect(ring()).toBe(0);
  });

  it('plays nothing with the sound turned off', () => {
    renderTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Turn sound off' }));
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    act(() => {
      jest.advanceTimersByTime(125_000);
    });
    expect(playIntervalCue).not.toHaveBeenCalled();
  });

  it('saves the brush with its start and duration, then closes', async () => {
    const { onSave, onOpenChange } = renderTimer();
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    act(() => {
      jest.advanceTimersByTime(95_000);
    });
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(onSave).toHaveBeenCalledWith(
      new Date('2026-11-08T08:00:00.000Z'),
      95
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
