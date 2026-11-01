import React from 'react';
import { render, screen, within } from '@testing-library/react-native';
import WeeklyGoalPlansSection from '../../src/components/WeeklyGoalPlansSection';
import { usePreferences } from '../../src/hooks/usePreferences';
import type { WeeklyGoalPlan } from '../../src/types/goals';

jest.mock('../../src/hooks/useGoals', () => ({
  useWeeklyGoalPlanMutations: () => ({
    deletePlan: jest.fn(),
    isPending: false,
  }),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;

const plan = (
  id: string,
  start_date: string,
  end_date: string | null
): WeeklyGoalPlan => ({
  id,
  plan_name: id,
  start_date,
  end_date,
  is_active: true,
  monday_preset_id: null,
  tuesday_preset_id: null,
  wednesday_preset_id: null,
  thursday_preset_id: null,
  friday_preset_id: null,
  saturday_preset_id: null,
  sunday_preset_id: null,
});

// One plan ends on the 26th and the next starts on the 27th.
const plans = [
  plan('Next', '2026-10-27', null),
  plan('Current', '2026-10-01', '2026-10-26'),
];

/** The name of the plan whose row carries the Active badge. */
const activePlan = (timezone: string) => {
  mockUsePreferences.mockReturnValue({
    preferences: { timezone },
  } as unknown as ReturnType<typeof usePreferences>);
  render(
    <WeeklyGoalPlansSection
      plans={plans}
      presets={[]}
      onCreate={jest.fn()}
      onEdit={jest.fn()}
    />
  );
  // The smallest element around the badge that names a plan is its row.
  let row = screen.getByText('Active').parent;
  while (row) {
    const named = plans.filter((p) => within(row!).queryByText(p.plan_name));
    if (named.length > 0)
      return named.length === 1 ? named[0]!.plan_name : null;
    row = row.parent;
  }
  return undefined;
};

describe('WeeklyGoalPlansSection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // 03:00 UTC on the 27th: still the 26th in Los Angeles, already the 27th in Tokyo.
    jest.setSystemTime(new Date('2026-10-27T03:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('marks the plan in force on the profile timezone day', () => {
    expect(activePlan('America/Los_Angeles')).toBe('Current');
  });

  it('follows a profile timezone already on the next day', () => {
    expect(activePlan('Asia/Tokyo')).toBe('Next');
  });

  it('marks no plan when none is in force, even one without an id', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { timezone: 'UTC' },
    } as unknown as ReturnType<typeof usePreferences>);
    const { id: _id, ...unsaved } = plan('Later', '2026-11-01', null);
    render(
      <WeeklyGoalPlansSection
        plans={[unsaved]}
        presets={[]}
        onCreate={jest.fn()}
        onEdit={jest.fn()}
      />
    );
    expect(screen.queryByText('Active')).toBeNull();
  });
});
