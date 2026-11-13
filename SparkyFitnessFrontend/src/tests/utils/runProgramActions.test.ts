import {
  restartBody,
  scheduleBody,
  setEnabledBody,
  setPositionBody,
  skipWorkoutBody,
  startProgramBody,
  toggleDayBody,
} from '@workspace/shared';
import { makeRunProgram } from '@/tests/mocks/runProgramFixture';

describe('request bodies', () => {
  const program = makeRunProgram({ next_index: 3, run_days: [1, 5] });

  it('starts from the first workout, switched on', () => {
    expect(startProgramBody('faster5k')).toEqual({
      program_id: 'faster5k',
      enabled: true,
      next_index: 0,
      start_date: undefined,
    });
    expect(startProgramBody('faster5k', '2026-11-02').start_date).toBe(
      '2026-11-02'
    );
    expect(startProgramBody('faster5k', null).start_date).toBeNull();
  });

  it('switches on and off keeping the place', () => {
    expect(setEnabledBody(program, false)).toEqual({
      program_id: 'beginner5k',
      enabled: false,
    });
  });

  it('moves the place', () => {
    expect(skipWorkoutBody(program).next_index).toBe(4);
    expect(restartBody(program).next_index).toBe(0);
    expect(setPositionBody(program, 12).next_index).toBe(12);
    expect(setPositionBody(program, -3).next_index).toBe(0);
    expect(setPositionBody(program, 2.9).next_index).toBe(2);
  });

  it('flips a weekday on the days the server has, keeping them sorted', () => {
    expect(toggleDayBody(program, 3).run_days).toEqual([1, 3, 5]);
    expect(toggleDayBody(program, 0).run_days).toEqual([0, 1, 5]);
    expect(toggleDayBody(program, 1).run_days).toEqual([5]);
  });

  it('sends only the schedule fields that change', () => {
    expect(scheduleBody(program, { startDay: '2026-11-02' })).toEqual({
      program_id: 'beginner5k',
      start_date: '2026-11-02',
    });
    expect(scheduleBody(program, { endDay: null })).toEqual({
      program_id: 'beginner5k',
      end_date: null,
    });
    expect(scheduleBody(program, {})).toEqual({ program_id: 'beginner5k' });
  });
});
