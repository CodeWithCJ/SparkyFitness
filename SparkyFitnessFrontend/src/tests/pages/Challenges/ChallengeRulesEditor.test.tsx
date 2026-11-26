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

  it('starts a steps daily cap at a big day, not 100 steps', () => {
    const onChange = jest.fn();
    render(
      <ChallengeRulesEditor
        rules={challengePreset('race_to_100k_steps').rules}
        onChange={onChange}
        units={units}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Days and times' }));
    fireEvent.click(
      screen.getByRole('switch', { name: 'Cap what one day can add' })
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dailyCap: 20000 })
    );
  });

  it('flags a refused value below the minimum, however small the field', () => {
    render(
      <ChallengeRulesEditor
        rules={challengePreset('all_rounder').rules}
        onChange={jest.fn()}
        units={units}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Points builder' }));
    const field = screen.getByLabelText('Below zone 1 (a minute)');
    fireEvent.change(field, { target: { value: '-0.2' } });
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });
});
