import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PICKER_PROGRAMS } from '@workspace/shared';
import TrainingProgramPicker from '@/pages/Exercises/TrainingPrograms/TrainingProgramPicker';
import { makeCustomProgram } from '@/tests/mocks/runProgramFixture';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const setup = (
  props: Partial<React.ComponentProps<typeof TrainingProgramPicker>> = {}
) => {
  const onStart = jest.fn();
  render(
    <TrainingProgramPicker
      storedProgramId={null}
      customPrograms={[]}
      busy={false}
      onStart={onStart}
      {...props}
    />
  );
  return { onStart };
};

describe('TrainingProgramPicker', () => {
  it('lists every built-in program that is not another one’s variant', () => {
    setup();
    for (const program of PICKER_PROGRAMS) {
      expect(
        screen.getByTestId(`training-program-${program.id}`)
      ).toBeInTheDocument();
    }
    expect(screen.queryByTestId('training-program-halfMarathon4')).toBeNull();
  });

  it('describes a program and its first week', () => {
    setup();
    const card = within(screen.getByTestId('training-program-beginner5k'));
    expect(card.getByText('Beginner 5K')).toBeInTheDocument();
    expect(card.getByText('9 weeks, 3 workouts a week')).toBeInTheDocument();
    expect(
      card.getByText(/Week 1: workouts of .* minutes\./)
    ).toBeInTheDocument();
  });

  it('starts the program that was picked', () => {
    const { onStart } = setup();
    const card = within(screen.getByTestId('training-program-beginner5k'));
    fireEvent.click(card.getByRole('button', { name: 'Start program' }));
    expect(onStart).toHaveBeenCalledWith('beginner5k', 'Beginner 5K');
  });

  it('offers 3 or 4 runs a week where a program has both, and starts the chosen one', () => {
    const { onStart } = setup();
    const card = within(screen.getByTestId('training-program-halfMarathon'));
    const three = card.getByRole('button', { name: '3 runs a week' });
    const four = card.getByRole('button', { name: '4 runs a week' });
    expect(three).toHaveAttribute('aria-pressed', 'true');
    expect(four).toHaveAttribute('aria-pressed', 'false');
    expect(card.getByText('12 weeks, 3 workouts a week')).toBeInTheDocument();

    fireEvent.click(four);
    expect(four).toHaveAttribute('aria-pressed', 'true');
    expect(card.getByText('12 weeks, 4 workouts a week')).toBeInTheDocument();
    fireEvent.click(card.getByRole('button', { name: 'Start program' }));
    expect(onStart).toHaveBeenCalledWith(
      'halfMarathon4',
      'Half marathon (4 runs a week)'
    );
  });

  it('has no run choice on a program with one version', () => {
    setup();
    expect(screen.queryByTestId('training-versions-beginner5k')).toBeNull();
  });

  it('marks the program that is already held and will not start it again', () => {
    setup({ storedProgramId: 'beginner5k' });
    const card = within(screen.getByTestId('training-program-beginner5k'));
    expect(card.getByText('Current program')).toBeInTheDocument();
    expect(card.getByRole('button', { name: 'Start program' })).toBeDisabled();
  });

  it('disables starting while a change is saving', () => {
    setup({ busy: true });
    const card = within(screen.getByTestId('training-program-beginner5k'));
    expect(card.getByRole('button', { name: 'Start program' })).toBeDisabled();
  });

  it('lists the person’s own plans and starts one under its custom id', () => {
    const { onStart } = setup({ customPrograms: [makeCustomProgram()] });
    const plans = within(screen.getByTestId('training-your-plans'));
    expect(plans.getByText('My tempo plan')).toBeInTheDocument();
    expect(plans.getByText('2 workouts')).toBeInTheDocument();
    fireEvent.click(plans.getByRole('button', { name: 'Start program' }));
    expect(onStart).toHaveBeenCalledWith('custom:custom-1', 'My tempo plan');
  });

  it('shows no plans section when there are none', () => {
    setup();
    expect(screen.queryByTestId('training-your-plans')).toBeNull();
  });
});
