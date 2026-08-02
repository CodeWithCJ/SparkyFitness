import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Glp1Coach from '@/pages/Medications/Glp1Coach';
import type { Medication } from '@/types/medications';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
  initReactI18next: { type: '3rdParty', init: jest.fn() },
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: (date: string | Date) =>
      new Date(date).toISOString().slice(0, 10),
  }),
}));

const mockUseSerumCurve = jest.fn();
jest.mock('@/hooks/useMedications', () => ({
  useSerumCurve: (medId: string) => mockUseSerumCurve(medId),
}));

// The surrounding GLP-1 panels each own their own queries; this suite is about the
// PK card's axis switch, so they are stubbed out to keep the tree isolated.
jest.mock('@/pages/Medications/FastingTimer', () => () => null);
jest.mock('@/pages/Medications/Glp1LogInjection', () => () => null);
jest.mock('@/pages/Medications/Glp1InventoryManager', () => () => null);
jest.mock('@/pages/Medications/Glp1TitrationManager', () => () => null);
jest.mock('@/pages/Medications/Glp1RecentInjections', () => () => null);

// Recharts needs a real layout box, which jsdom does not give it. These stubs keep
// the component tree renderable so the assertions can focus on the toggle.
jest.mock('recharts', () => {
  const Container = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  // AreaChart has to stand in as an <svg>: the component renders a <defs>/
  // <linearGradient>/<stop> gradient inside it, and those are only valid in an
  // SVG context. Standing it in as a <div> strands them and React logs an
  // "unrecognized tag" error for each one on every render.
  const Svg = ({ children }: { children?: React.ReactNode }) => (
    <svg>{children}</svg>
  );
  const Nothing = () => null;
  return {
    ResponsiveContainer: Container,
    AreaChart: Svg,
    Area: Nothing,
    CartesianGrid: Nothing,
    ReferenceLine: Nothing,
    Tooltip: Nothing,
    XAxis: Nothing,
    YAxis: Nothing,
  };
});

const med = {
  id: 'med-1',
  name: 'Ozempic',
  type_id: 'injection',
  custom_fields: { glp1_drug: 'semaglutide' },
} as unknown as Medication;

const curve = [
  { day: 0, level: 1, fraction: 1 },
  { day: 7, level: 0.5, fraction: 0.5 },
];

describe('Glp1Coach PK axis switch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers a Dates/Days switch and defaults to Dates when an anchor exists', () => {
    mockUseSerumCurve.mockReturnValue({
      data: {
        drugId: 'semaglutide',
        drugName: 'Semaglutide',
        curve,
        currentLevelFraction: 0.7,
        doseDays: [0, 7],
        anchorDate: '2026-03-03T09:00:00.000Z',
        disclaimer: 'Modeled estimate',
      },
    });

    render(<Glp1Coach med={med} />);

    const dates = screen.getByRole('button', { name: 'Dates' });
    const days = screen.getByRole('button', { name: 'Days' });
    expect(dates).toHaveAttribute('aria-pressed', 'true');
    expect(days).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to the day axis when Days is clicked', () => {
    mockUseSerumCurve.mockReturnValue({
      data: {
        drugId: 'semaglutide',
        curve,
        currentLevelFraction: 0.7,
        doseDays: [0, 7],
        anchorDate: '2026-03-03T09:00:00.000Z',
        disclaimer: 'Modeled estimate',
      },
    });

    render(<Glp1Coach med={med} />);
    fireEvent.click(screen.getByRole('button', { name: 'Days' }));

    expect(screen.getByRole('button', { name: 'Days' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Dates' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('hides the switch when there is no anchor date to plot against', () => {
    mockUseSerumCurve.mockReturnValue({
      data: {
        drugId: 'semaglutide',
        curve,
        currentLevelFraction: 0.7,
        doseDays: [0, 7],
        anchorDate: null,
        disclaimer: 'Modeled estimate',
      },
    });

    render(<Glp1Coach med={med} />);

    expect(screen.queryByRole('button', { name: 'Dates' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Days' })).toBeNull();
  });

  it('shows the empty state and no switch when there is no curve', () => {
    mockUseSerumCurve.mockReturnValue({
      data: {
        drugId: null,
        curve: [],
        currentLevelFraction: null,
        doseDays: [],
        anchorDate: null,
        disclaimer: 'Modeled estimate',
      },
    });

    render(<Glp1Coach med={med} />);

    expect(screen.queryByRole('button', { name: 'Dates' })).toBeNull();
    expect(
      screen.getByText(/Log injections to model your serum level/)
    ).toBeInTheDocument();
  });
});
