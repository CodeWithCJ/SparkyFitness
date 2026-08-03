import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { formatDate } from '../../src/utils/dateUtils';
import CycleCard from '../../src/components/CycleCard';

type Locale = 'en' | 'pl';
type Settings = { enabled: boolean; onboarded_at: string | null; mode: string };
type CycleInfo = {
  phase: string;
  day: number;
  avgCycleLength: number;
  avgPeriodLength: number;
  fertileStartDay: number;
  fertileEndDay: number;
  ovulationDay: number;
  daysLate: number;
  nextPeriodStart: string | null;
};

const mockNavigation = () => ({ navigate: jest.fn() });

let mockSettingsResult: { settings: Settings | null; isLoading: boolean };
let mockDiscreetMode = false;
let mockPregnancyResult: { pregnancy: { status: string } | null };
let mockOverviewResult: {
  overview: { gestation: { week: number; day: number; daysRemaining: number } | null } | null;
};
let mockCycleInfoResult: CycleInfo | null;
let mockCycleRingProps: Record<string, unknown> | null;
let mockWombSceneProps: Record<string, unknown> | null;
const mockGetPhaseColor = jest.fn(() => '#phase-color');

function setTestLocale(locale: Locale): void {
  (globalThis as typeof globalThis & { __setTestLocale: (value: Locale) => void }).__setTestLocale(locale);
}

function contractText(view: ReturnType<typeof render>): string {
  return JSON.stringify(view.toJSON()).toLowerCase();
}

function expectNoPrivateTerms(view: ReturnType<typeof render>): void {
  const contract = contractText(view);
  for (const term of [
    'cycle',
    'period',
    'pregnancy',
    'fertility',
    'menopause',
    'ovulation',
    'cykl',
    'okres',
    'ciąża',
    'płodność',
    'menopauza',
    'owulacja',
  ]) {
    expect(contract).not.toContain(term);
  }
}

jest.mock('uniwind', () => ({ useCSSVariable: () => ['#accent'] }));
jest.mock('../../src/localization', () => ({
  getAppLocale: () => (globalThis.__activeWorkoutTestLocale === 'pl' ? 'pl-PL' : 'en-US'),
}));
jest.mock('../../src/hooks/useCycleSettings', () => ({
  useCycleSettings: () => mockSettingsResult,
}));
jest.mock('../../src/hooks/useDiscreetMode', () => ({
  useDiscreetMode: () => ({ discreetMode: mockDiscreetMode }),
}));
jest.mock('../../src/hooks/usePregnancy', () => ({
  useCurrentPregnancy: () => mockPregnancyResult,
  usePregnancyOverview: () => mockOverviewResult,
}));
jest.mock('../../src/hooks/useCyclePredictionData', () => ({
  useCyclePredictionData: () => mockCycleInfoResult,
}));
jest.mock('../../src/utils/cycleDisplayUtils', () => ({
  getPhaseColor: (...args: unknown[]) => mockGetPhaseColor(...args),
}));
jest.mock('../../src/components/Icon', () => () => null);
jest.mock('../../src/components/wellness/pregnancy/WombScene', () => {
  const mockReact = require('react');
  const ReactNative = require('react-native');
  return (props: Record<string, unknown>) => {
    mockWombSceneProps = props;
    return mockReact.createElement(ReactNative.View, { testID: 'womb-scene' });
  };
});
jest.mock('../../src/components/wellness/CycleRing', () => {
  const mockReact = require('react');
  const ReactNative = require('react-native');
  return (props: Record<string, unknown>) => {
    mockCycleRingProps = props;
    return mockReact.createElement(ReactNative.View, { testID: 'cycle-ring' });
  };
});
jest.mock('../../src/components/wellness/theme/wellnessTokens', () => ({
  useWellnessTokens: () => ({ phasePregnant: '#pregnant-color' }),
}));

describe('CycleCard contract', () => {
  beforeEach(() => {
    setTestLocale('en');
    mockSettingsResult = {
      settings: { enabled: true, onboarded_at: '2026-01-01', mode: 'standard' },
      isLoading: false,
    };
    mockDiscreetMode = false;
    mockPregnancyResult = { pregnancy: null };
    mockOverviewResult = { overview: null };
    mockCycleInfoResult = null;
    mockCycleRingProps = null;
    mockWombSceneProps = null;
    mockGetPhaseColor.mockClear();
  });

  it.each([
    [false, { settings: { enabled: true, onboarded_at: null, mode: 'standard' }, isLoading: true }],
    [false, { settings: null, isLoading: false }],
    [false, { settings: { enabled: false, onboarded_at: '2026-01-01', mode: 'standard' }, isLoading: false }],
  ])('handles loading and hidden states', (expectedVisible, result) => {
    mockSettingsResult = result;
    const view = render(<CycleCard navigation={mockNavigation() as never} />);
    expect(view.toJSON() !== null).toBe(expectedVisible);
  });

  it.each([
    ['en', 'Cycle tracking', 'Set up', 'Track cycle phases, predictions, symptoms, and pregnancy milestones.', 'Set up cycle and pregnancy tracking'],
    ['pl', 'Monitorowanie cyklu', 'Skonfiguruj', 'Monitoruj fazy cyklu, prognozy, objawy i etapy ciąży.', 'Skonfiguruj monitorowanie cyklu i ciąży'],
  ] as const)('renders nondiscreet onboarding in %s', (locale, title, action, description, accessibilityLabel) => {
    setTestLocale(locale);
    mockSettingsResult.settings = { enabled: true, onboarded_at: null, mode: 'standard' };
    const navigation = mockNavigation();
    const view = render(<CycleCard navigation={navigation as never} />);

    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText(action)).toBeTruthy();
    expect(view.getByText(description)).toBeTruthy();
    expect(view.getByLabelText(accessibilityLabel)).toBeTruthy();
    fireEvent.press(view.getByLabelText(accessibilityLabel));
    expect(navigation.navigate).toHaveBeenCalledWith('CycleOnboarding');
    expect(navigation.navigate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['en', 'Wellness', 'Set up wellness tracking', 'Track your wellness parameters and predictions.'],
    ['pl', 'Zdrowie', 'Skonfiguruj monitorowanie zdrowia', 'Monitoruj parametry zdrowotne i prognozy.'],
  ] as const)('renders discreet onboarding without private context in %s', (locale, title, accessibilityLabel, description) => {
    setTestLocale(locale);
    mockDiscreetMode = true;
    mockSettingsResult.settings = { enabled: true, onboarded_at: null, mode: 'pregnant' };
    const view = render(<CycleCard navigation={mockNavigation() as never} />);

    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText('Set up' === title ? 'Set up' : locale === 'en' ? 'Set up' : 'Skonfiguruj')).toBeTruthy();
    expect(view.getByText(description)).toBeTruthy();
    expect(view.getByLabelText(accessibilityLabel)).toBeTruthy();
    expectNoPrivateTerms(view);
  });

  it.each([
    ['en', 8, 'Day 8', 'Open wellness tracking hub'],
    ['pl', 8, 'Dzień 8', 'Otwórz centrum monitorowania zdrowia'],
    ['en', 0, 'Wellness tracking active', 'Open wellness tracking hub'],
    ['pl', 0, 'Monitorowanie zdrowia aktywne', 'Otwórz centrum monitorowania zdrowia'],
  ] as const)('renders active discreet card neutrally in %s', (locale, day, primaryText, accessibilityLabel) => {
    setTestLocale(locale);
    mockDiscreetMode = true;
    mockCycleInfoResult = {
      phase: 'ovulation', day, avgCycleLength: 28, avgPeriodLength: 5,
      fertileStartDay: 10, fertileEndDay: 16, ovulationDay: 14, daysLate: 0, nextPeriodStart: null,
    };
    const navigation = mockNavigation();
    const view = render(<CycleCard navigation={navigation as never} />);

    expect(view.getByText(primaryText)).toBeTruthy();
    expect(view.getByLabelText(accessibilityLabel)).toBeTruthy();
    fireEvent.press(view.getByLabelText(accessibilityLabel));
    expect(navigation.navigate).toHaveBeenCalledWith('CycleHub');
    expectNoPrivateTerms(view);
  });

  it.each([
    ['en', 'Week 20, day 3', 'Size comparison: A banana', '16.4 cm', '300 g', '2 days to due date', 'Open cycle and pregnancy tracking hub'],
    ['pl', 'Tydzień 20, dzień 3', 'Porównanie wielkości: banan', '16.4 cm', '300 g', '2 dni do terminu porodu', 'Otwórz centrum monitorowania cyklu i ciąży'],
  ] as const)('renders gestational pregnancy details in %s', (locale, weekDay, comparison, length, weight, due, accessibilityLabel) => {
    setTestLocale(locale);
    mockSettingsResult.settings = { enabled: true, onboarded_at: '2026-01-01', mode: 'pregnant' };
    mockPregnancyResult = { pregnancy: { status: 'active' } };
    mockOverviewResult = { overview: { gestation: { week: 20, day: 3, daysRemaining: 2 } } };
    const navigation = mockNavigation();
    const view = render(<CycleCard navigation={navigation as never} />);

    expect(view.getByText(weekDay)).toBeTruthy();
    expect(view.getByText(comparison)).toBeTruthy();
    expect(view.getByText(length)).toBeTruthy();
    expect(view.getByText(weight)).toBeTruthy();
    expect(view.getByText(due)).toBeTruthy();
    expect(mockWombSceneProps).toEqual({ scene: 20, size: 72 });
    expect(view.getByTestId('womb-scene')).toBeTruthy();
    expect(view.getByLabelText(accessibilityLabel)).toBeTruthy();
    fireEvent.press(view.getByLabelText(accessibilityLabel));
    expect(navigation.navigate).toHaveBeenCalledWith('CycleHub');
  });

  it.each([
    ['en', 1, '1 day to due date'], ['en', 2, '2 days to due date'], ['en', 5, '5 days to due date'],
    ['pl', 1, '1 dzień do terminu porodu'], ['pl', 2, '2 dni do terminu porodu'], ['pl', 5, '5 dni do terminu porodu'],
  ] as const)('renders due-date pluralization in pregnancy view for %s', (locale, daysRemaining, due) => {
    setTestLocale(locale);
    mockSettingsResult.settings = { enabled: true, onboarded_at: '2026-01-01', mode: 'pregnant' };
    mockOverviewResult = { overview: { gestation: { week: 20, day: 3, daysRemaining } } };
    const view = render(<CycleCard navigation={mockNavigation() as never} />);
    expect(view.getByText(due)).toBeTruthy();
  });

  it.each([
    ['en', 'Due today'], ['pl', 'Termin porodu przypada dziś'],
  ] as const)('renders due today in %s', (locale, due) => {
    setTestLocale(locale);
    mockSettingsResult.settings = { enabled: true, onboarded_at: '2026-01-01', mode: 'pregnant' };
    mockOverviewResult = { overview: { gestation: { week: 40, day: 0, daysRemaining: 0 } } };
    const view = render(<CycleCard navigation={mockNavigation() as never} />);
    expect(view.getByText(due)).toBeTruthy();
  });

  it.each([
    ['en', 'Pregnancy tracking active', 'Tap to view gestational progress.', 'Open cycle and pregnancy tracking hub'],
    ['pl', 'Monitorowanie ciąży aktywne', 'Dotknij, aby zobaczyć postęp ciąży.', 'Otwórz centrum monitorowania cyklu i ciąży'],
  ] as const)('renders pregnancy fallback without overview in %s', (locale, active, details, accessibilityLabel) => {
    setTestLocale(locale);
    mockSettingsResult.settings = { enabled: true, onboarded_at: '2026-01-01', mode: 'pregnant' };
    const view = render(<CycleCard navigation={mockNavigation() as never} />);
    expect(view.getByText(active)).toBeTruthy();
    expect(view.getByText(details)).toBeTruthy();
    expect(view.getByLabelText(accessibilityLabel)).toBeTruthy();
  });

  it.each([
    ['en', 'menstrual', 'Period'], ['en', 'follicular', 'Follicular phase'], ['en', 'fertile', 'Fertile window'],
    ['en', 'ovulation', 'Ovulation day'], ['en', 'luteal', 'Luteal phase'], ['en', 'unknown', 'Cycle active'],
    ['pl', 'menstrual', 'Okres'], ['pl', 'follicular', 'Faza folikularna'], ['pl', 'fertile', 'Okno płodne'],
    ['pl', 'ovulation', 'Dzień owulacji'], ['pl', 'luteal', 'Faza lutealna'], ['pl', 'unknown', 'Cykl aktywny'],
  ] as const)('renders localized phase and uses getPhaseColor for %s', (locale, phase, phaseLabel) => {
    setTestLocale(locale);
    mockCycleInfoResult = {
      phase, day: 8, avgCycleLength: 28, avgPeriodLength: 5,
      fertileStartDay: 10, fertileEndDay: 16, ovulationDay: 14, daysLate: 0, nextPeriodStart: null,
    };
    const view = render(<CycleCard navigation={mockNavigation() as never} />);
    expect(view.getByText(phaseLabel)).toBeTruthy();
    expect(view.queryByText(`cycleCard.phase.${phase}`)).toBeNull();
    expect(mockGetPhaseColor).toHaveBeenCalledWith(phase, { phasePregnant: '#pregnant-color' });
  });

  it.each([
    ['en', 1, 'Period is 1 day late'], ['en', 2, 'Period is 2 days late'], ['en', 5, 'Period is 5 days late'],
    ['pl', 1, 'Okres spóźnia się o 1 dzień'], ['pl', 2, 'Okres spóźnia się o 2 dni'], ['pl', 5, 'Okres spóźnia się o 5 dni'],
    ['pl', 12, 'Okres spóźnia się o 12 dni'], ['pl', 22, 'Okres spóźnia się o 22 dni'], ['pl', 25, 'Okres spóźnia się o 25 dni'],
  ] as const)('renders late-period pluralization in %s', (locale, daysLate, label) => {
    setTestLocale(locale);
    mockCycleInfoResult = {
      phase: 'luteal', day: 8, avgCycleLength: 28, avgPeriodLength: 5,
      fertileStartDay: 10, fertileEndDay: 16, ovulationDay: 14, daysLate, nextPeriodStart: null,
    };
    const view = render(<CycleCard navigation={mockNavigation() as never} />);
    expect(view.getByText(label)).toBeTruthy();
  });

  it.each([
    ['en', 'Next period expected: Thu, Jan 15'], ['pl', 'Przewidywany następny okres: czw., 15 sty'],
  ] as const)('renders the localized next-period date in %s', (locale, expectedPrefix) => {
    setTestLocale(locale);
    const date = '2026-01-15';
    mockCycleInfoResult = {
      phase: 'follicular', day: 8, avgCycleLength: 28, avgPeriodLength: 5,
      fertileStartDay: 10, fertileEndDay: 16, ovulationDay: 14, daysLate: 0, nextPeriodStart: date,
    };
    const view = render(<CycleCard navigation={mockNavigation() as never} />);
    const expected = `${locale === 'en' ? 'Next period expected' : 'Przewidywany następny okres'}: ${formatDate(date)}`;
    expect(view.getByText(expected)).toBeTruthy();
    expect(expectedPrefix).toBe(expected);
  });

  it('passes the complete positive-day CycleRing contract', () => {
    mockCycleInfoResult = {
      phase: 'fertile', day: 8, avgCycleLength: 29, avgPeriodLength: 6,
      fertileStartDay: 11, fertileEndDay: 17, ovulationDay: 14, daysLate: 0, nextPeriodStart: null,
    };
    setTestLocale('en');
    render(<CycleCard navigation={mockNavigation() as never} />);
    expect(mockCycleRingProps).toEqual({
      cycleDay: 8, cycleLength: 29, periodLength: 6, fertileStartDay: 11,
      fertileEndDay: 17, ovulationDay: 14, centerLabel: '', centerValue: 'Day 8',
       centerSub: '', size: 98, strokeWidth: 7.5,
    });
  });

  it('passes a null CycleRing day and localized active value when no day is active', () => {
    mockCycleInfoResult = {
      phase: 'fertile', day: 0, avgCycleLength: 29, avgPeriodLength: 6,
      fertileStartDay: 11, fertileEndDay: 17, ovulationDay: 14, daysLate: 0, nextPeriodStart: null,
    };
    setTestLocale('pl');
    render(<CycleCard navigation={mockNavigation() as never} />);
    expect(mockCycleRingProps).toEqual(expect.objectContaining({ cycleDay: null, centerValue: 'Aktywny' }));
  });

  it.each([
    ['en', 'Tracking active', 'Tap to view cycle tracking hub.'],
    ['pl', 'Monitorowanie aktywne', 'Dotknij, aby otworzyć centrum monitorowania cyklu.'],
  ] as const)('renders no-cycle-info fallback in %s', (locale, active, details) => {
    setTestLocale(locale);
    mockSettingsResult.settings = { enabled: true, onboarded_at: '2026-01-01', mode: 'postpartum' };
    const view = render(<CycleCard navigation={mockNavigation() as never} />);
    expect(view.getByText(active)).toBeTruthy();
    expect(view.getByText(details)).toBeTruthy();
    expect(view.queryByText('postpartum')).toBeNull();
  });
});
