import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import FastingZoneBar from '@/pages/Fasting/FastingZoneBar';
import EatingWindowBar from '@/pages/Fasting/EatingWindowBar';

let mockTimeFormat = 'HH:mm';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timeFormat: mockTimeFormat }),
}));

// No offset, so date-fns parses these as local wall-clock times.
const START = '2026-10-18T14:30:00';
const END = '2026-10-19T06:30:00';

describe('fasting bars honor the time format preference', () => {
  it('shows 24-hour start and target times when the preference is HH:mm', () => {
    mockTimeFormat = 'HH:mm';
    render(
      <FastingZoneBar hoursFasted={4} startTime={START} targetEndTime={END} />
    );

    expect(screen.getByText('Started 14:30')).toBeInTheDocument();
    expect(screen.getByText('Target 06:30')).toBeInTheDocument();
  });

  it('shows 12-hour start and target times when the preference is h:mm A', () => {
    mockTimeFormat = 'h:mm A';
    render(
      <FastingZoneBar hoursFasted={4} startTime={START} targetEndTime={END} />
    );

    expect(screen.getByText('Started 2:30 PM')).toBeInTheDocument();
    expect(screen.getByText('Target 6:30 AM')).toBeInTheDocument();
  });

  it('shows 24-hour eating window times when the preference is HH:mm', () => {
    mockTimeFormat = 'HH:mm';
    render(<EatingWindowBar startTime={START} targetEndTime={END} />);

    expect(screen.getByText('Started 14:30')).toBeInTheDocument();
    expect(screen.getByText('Closes 06:30')).toBeInTheDocument();
  });
});
