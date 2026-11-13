import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ProgressPhotoDay } from '@workspace/shared';
import { ProgressPhotoTimelapseDialog } from '@/pages/CheckIn/ProgressPhotoTimelapseDialog';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    timezone: 'UTC',
    formatDate: (date: string) => date,
    parseDateInUserTimezone: (date: string) => new Date(`${date}T00:00:00`),
  }),
}));

const frontDay = (
  entry_date: string,
  weight: number | null = null
): ProgressPhotoDay => ({
  entry_date,
  weight,
  photos: {
    front: {
      id: `${entry_date}-front`,
      entry_date,
      photo_type: 'front',
      weight,
    },
  },
});

// Newest first, as the gallery endpoint returns it; all inside the default
// three-month window ending on the fixed "today" below.
const gallery = [
  frontDay('2026-06-20', 70),
  frontDay('2026-06-01'),
  frontDay('2026-05-10', 72),
];

const renderDialog = (days: ProgressPhotoDay[] = gallery) =>
  render(
    <ProgressPhotoTimelapseDialog
      open
      onOpenChange={jest.fn()}
      days={days}
      onLogWeight={jest.fn()}
    />
  );

const shownFrame = () => screen.getByAltText(/^2026-/);

describe('ProgressPhotoTimelapseDialog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-30T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts on the oldest photo of the window', () => {
    renderDialog();

    expect(shownFrame()).toHaveAttribute('alt', '2026-05-10');
    expect(screen.getByText('1 of 3 · Last 3 months')).toBeInTheDocument();
  });

  it('plays forward one frame per tick and stops on the latest', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(shownFrame()).toHaveAttribute('alt', '2026-06-01');

    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(shownFrame()).toHaveAttribute('alt', '2026-06-20');

    // At the end the clock stops and the button offers to play again.
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('3 of 3 · Last 3 months')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('runs faster at the Fast speed', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Fast' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(shownFrame()).toHaveAttribute('alt', '2026-06-01');
  });

  it('steps with the previous and next buttons', () => {
    renderDialog();

    const previous = screen.getByRole('button', { name: 'Previous photo' });
    expect(previous).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(shownFrame()).toHaveAttribute('alt', '2026-06-01');

    fireEvent.click(previous);
    expect(shownFrame()).toHaveAttribute('alt', '2026-05-10');
  });

  it('plays the whole history when the default window is nearly empty', () => {
    renderDialog([frontDay('2025-02-01'), frontDay('2025-01-01')]);

    expect(screen.getByText('1 of 2 · All time')).toBeInTheDocument();
  });

  it('keeps the date picker open after choosing Custom range', () => {
    renderDialog();

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Play back' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByRole('option', { name: 'Custom range' }));
    // The Select hands focus back on a zero-delay timer once it has closed;
    // that must not dismiss the picker it just opened.
    act(() => {
      jest.advanceTimersByTime(50);
    });

    expect(
      screen.getByRole('button', { name: 'Play this range' })
    ).toBeInTheDocument();
  });

  it('steps with the arrow keys wherever focus is in the dialog', () => {
    renderDialog();

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(shownFrame()).toHaveAttribute('alt', '2026-06-01');

    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(shownFrame()).toHaveAttribute('alt', '2026-05-10');
  });

  it('keeps the next button focusable on the last frame', () => {
    renderDialog();

    const next = screen.getByRole('button', { name: 'Next photo' });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(shownFrame()).toHaveAttribute('alt', '2026-06-20');

    // A natively disabled button would drop focus to <body> here.
    expect(next).not.toBeDisabled();
    expect(next).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(next);
    expect(shownFrame()).toHaveAttribute('alt', '2026-06-20');
  });

  it('shows a placeholder, not the previous photo, when a frame fails to load', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    fireEvent.error(shownFrame());

    expect(screen.getByRole('img', { name: '2026-06-01' })).toBeInTheDocument();
    expect(
      document.querySelector(
        'img[src="/api/measurements/check-in-photos/file/2026-05-10-front"]'
      )
    ).toBeNull();
  });

  const outgoingFrame = () =>
    document.querySelector(
      'img[src="/api/measurements/check-in-photos/file/2026-05-10-front"]'
    );

  it('drops the outgoing frame once the fade has finished', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    // Loading alone is not enough: the new frame is still fading in over it.
    fireEvent.load(shownFrame());
    expect(outgoingFrame()).not.toBeNull();

    fireEvent.animationEnd(shownFrame());
    expect(outgoingFrame()).toBeNull();
  });

  describe('with reduced motion', () => {
    let matchMedia: jest.SpyInstance;

    beforeEach(() => {
      matchMedia = jest
        .spyOn(window, 'matchMedia')
        .mockImplementation((query: string) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        }));
    });

    afterEach(() => {
      matchMedia.mockRestore();
    });

    it('drops the outgoing frame once the new one loads', () => {
      renderDialog();
      fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
      expect(outgoingFrame()).not.toBeNull();

      // No fade runs, so there is no animationend to wait for.
      fireEvent.load(shownFrame());
      expect(outgoingFrame()).toBeNull();
    });

    it('keeps nothing underneath after stepping back before a frame loads', () => {
      renderDialog();
      fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
      fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));

      // The first frame's image is reused and fires no load event, so the
      // second one must not be left mounted under it.
      expect(shownFrame()).toHaveAttribute('alt', '2026-05-10');
      expect(
        document.querySelector(
          'img[src="/api/measurements/check-in-photos/file/2026-06-01-front"]'
        )
      ).toBeNull();
    });
  });

  it('shows the empty state with fewer than two photos of the angle', () => {
    renderDialog([frontDay('2026-06-20')]);

    expect(
      screen.getByText(
        'Add photos of this angle on at least two days to play a time-lapse.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Play' })
    ).not.toBeInTheDocument();
  });
});
