import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { challengePreset, challengeRulesSchema } from '@workspace/shared';
import ChallengeRulesEditor from '@/pages/Challenges/ChallengeRulesEditor';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const units = {
  distanceUnit: 'km' as const,
  energyUnit: 'kcal' as const,
  energyLabel: 'kcal',
};

describe('the rules editor', () => {
  it('keeps the weekly goal off on a daily points challenge and says why', () => {
    const daily = challengeRulesSchema.parse({
      ...challengePreset('all_rounder').rules,
      period: 'day',
      points: { ...challengePreset('all_rounder').rules.points, goal: null },
    });
    render(
      <ChallengeRulesEditor rules={daily} onChange={jest.fn()} units={units} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Points builder' }));
    const goal = screen.getByRole('switch', {
      name: 'Self-adjusting weekly goal bonus',
    });
    expect(goal).toBeDisabled();
    expect(goal).not.toBeChecked();
    expect(
      screen.getByText(
        'The weekly goal needs a challenge scored by the week or longer.'
      )
    ).toBeInTheDocument();
  });

  it('offers the weekly goal on a weekly challenge', () => {
    render(
      <ChallengeRulesEditor
        rules={challengePreset('all_rounder').rules}
        onChange={jest.fn()}
        units={units}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Points builder' }));
    expect(
      screen.getByRole('switch', { name: 'Self-adjusting weekly goal bonus' })
    ).toBeEnabled();
    expect(
      screen.queryByText(
        'The weekly goal needs a challenge scored by the week or longer.'
      )
    ).not.toBeInTheDocument();
  });
});
