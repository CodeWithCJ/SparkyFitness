import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import IntervalCard from '../../src/components/recording/IntervalCard';
import IntervalSetup, {
  DEFAULT_CUSTOM_INTERVALS,
} from '../../src/components/recording/IntervalSetup';
import { buildIntervalPlan, intervalPosition } from '@workspace/shared';

const plan = buildIntervalPlan({
  style: 'runWalk',
  warmupSeconds: 0,
  workSeconds: 60,
  recoverySeconds: 90,
  rounds: 2,
  cooldownSeconds: 0,
});

describe('IntervalCard', () => {
  it('shows the step, time left, round and what is next', () => {
    render(<IntervalCard plan={plan} position={intervalPosition(plan, 20)!} />);
    expect(screen.getByText('Run')).toBeTruthy();
    expect(screen.getByText('0:40')).toBeTruthy();
    expect(screen.getByText('Round 1 of 2')).toBeTruthy();
    expect(screen.getByText('Next: Walk 1:30')).toBeTruthy();
  });

  it('shows metres left on a distance step and a distance as what is next', () => {
    const reps = buildIntervalPlan({
      style: 'fastEasy',
      warmupSeconds: 60,
      workSeconds: 90,
      workMeters: 400,
      recoverySeconds: 60,
      rounds: 2,
      cooldownSeconds: 0,
    });
    render(
      <IntervalCard
        plan={reps}
        position={intervalPosition(reps, 30, {
          cursor: { index: 0, startSeconds: 0, startMeters: 0 },
          meters: 90,
        })!}
      />
    );
    expect(screen.getByText('Next: Fast 400 m')).toBeTruthy();
    render(
      <IntervalCard
        plan={reps}
        position={intervalPosition(reps, 120, {
          cursor: { index: 1, startSeconds: 60, startMeters: 200 },
          meters: 450,
        })!}
      />
    );
    expect(screen.getByText('150 m')).toBeTruthy();
  });

  it('says so when the plan is finished', () => {
    render(
      <IntervalCard plan={plan} position={intervalPosition(plan, 9999)!} />
    );
    expect(screen.getByText('Intervals complete')).toBeTruthy();
  });
});

describe('IntervalCard on a Zone 2 step', () => {
  const band = { minBpm: 111, maxBpm: 129 };
  const zone2Plan = (heartRate?: typeof band) => ({
    style: 'runWalk' as const,
    steps: [
      {
        kind: 'work' as const,
        seconds: 1800,
        effort: 'zone2' as const,
        ...(heartRate ? { heartRate } : {}),
      },
    ],
  });
  const at = (plan: ReturnType<typeof zone2Plan>, seconds: number) =>
    intervalPosition(plan, seconds)!;

  it('names the step and shows the target range with the in-zone cue', () => {
    const plan = zone2Plan(band);
    render(
      <IntervalCard
        plan={plan}
        position={at(plan, 600)}
        heartRate={120}
        heartRateSource
      />
    );
    expect(screen.getByText('Zone 2 run')).toBeTruthy();
    expect(screen.getByText('Zone 2: 111–129 bpm')).toBeTruthy();
    expect(screen.getByText('In Zone 2. Keep this effort.')).toBeTruthy();
  });

  it('cues above the range', () => {
    const plan = zone2Plan(band);
    render(
      <IntervalCard
        plan={plan}
        position={at(plan, 600)}
        heartRate={140}
        heartRateSource
      />
    );
    expect(
      screen.getByText(
        'Above Zone 2. Ease off, or walk until your heart rate settles.'
      )
    ).toBeTruthy();
  });

  it('cues below the range', () => {
    const plan = zone2Plan(band);
    render(
      <IntervalCard
        plan={plan}
        position={at(plan, 600)}
        heartRate={100}
        heartRateSource
      />
    );
    expect(
      screen.getByText('Below Zone 2. You can pick it up a little.')
    ).toBeTruthy();
  });

  it('waits for a reading when a watch is paired but has sent none', () => {
    const plan = zone2Plan(band);
    render(
      <IntervalCard plan={plan} position={at(plan, 600)} heartRateSource />
    );
    expect(screen.getByText('Waiting for a heart rate reading…')).toBeTruthy();
  });

  it('falls back to the talk test, keeping the range, with no watch', () => {
    const plan = zone2Plan(band);
    render(<IntervalCard plan={plan} position={at(plan, 600)} />);
    expect(screen.getByText('Zone 2: 111–129 bpm')).toBeTruthy();
    expect(
      screen.getByText(/easy enough to talk in full sentences/)
    ).toBeTruthy();
  });

  it('uses the talk test alone when there is no range', () => {
    const plan = zone2Plan();
    render(
      <IntervalCard
        plan={plan}
        position={at(plan, 600)}
        heartRate={150}
        heartRateSource
      />
    );
    expect(screen.queryByText(/bpm/)).toBeNull();
    expect(
      screen.getByText(/easy enough to talk in full sentences/)
    ).toBeTruthy();
  });

  it('does not add Zone 2 wording to other stretches', () => {
    const fast = {
      style: 'fastEasy' as const,
      steps: [
        {
          kind: 'work' as const,
          seconds: 120,
          heartRate: { minBpm: 160, maxBpm: 175 },
        },
      ],
    };
    render(
      <IntervalCard
        plan={fast}
        position={intervalPosition(fast, 10)!}
        heartRate={150}
        heartRateSource
      />
    );
    expect(screen.getByText('160–175 bpm')).toBeTruthy();
    expect(screen.queryByText(/Zone 2/)).toBeNull();
  });
});

describe('IntervalSetup custom builder', () => {
  it('changes rounds with the steppers', () => {
    const onCustom = jest.fn();
    render(
      <IntervalSetup
        choice="custom"
        onChoice={jest.fn()}
        custom={DEFAULT_CUSTOM_INTERVALS}
        onCustom={onCustom}
      />
    );
    fireEvent.press(screen.getByLabelText('Increase Rounds'));
    expect(onCustom).toHaveBeenCalledWith({
      ...DEFAULT_CUSTOM_INTERVALS,
      rounds: DEFAULT_CUSTOM_INTERVALS.rounds + 1,
    });
  });
});

describe('IntervalSetup for a walk or ride', () => {
  it('calls the steps Fast and Easy and hides the run/walk style', () => {
    render(
      <IntervalSetup
        choice="custom"
        onChoice={jest.fn()}
        custom={DEFAULT_CUSTOM_INTERVALS}
        onCustom={jest.fn()}
        activity="walk"
      />
    );
    expect(screen.getByText('Fast')).toBeTruthy();
    expect(screen.getByText('Easy')).toBeTruthy();
    expect(screen.queryByText('Run')).toBeNull();
    expect(screen.queryByText('Run / walk')).toBeNull();
    expect(
      screen.getByText(
        'Follow timed steps of fast and easy effort. You are told when to switch.'
      )
    ).toBeTruthy();
  });

  it('keeps the run/walk wording for a run', () => {
    render(
      <IntervalSetup
        choice="custom"
        onChoice={jest.fn()}
        custom={DEFAULT_CUSTOM_INTERVALS}
        onCustom={jest.fn()}
        activity="run"
      />
    );
    expect(screen.getByText('Run / walk')).toBeTruthy();
    expect(screen.getByText('Run')).toBeTruthy();
  });
});

describe('IntervalSetup distance', () => {
  it('switches Custom work to a distance and steps it by 100 m', () => {
    const onCustom = jest.fn();
    const { rerender } = render(
      <IntervalSetup
        choice="custom"
        onChoice={jest.fn()}
        custom={DEFAULT_CUSTOM_INTERVALS}
        onCustom={onCustom}
      />
    );
    fireEvent.press(screen.getByText('By distance'));
    expect(onCustom).toHaveBeenLastCalledWith({
      ...DEFAULT_CUSTOM_INTERVALS,
      workMeters: 400,
    });
    rerender(
      <IntervalSetup
        choice="custom"
        onChoice={jest.fn()}
        custom={{ ...DEFAULT_CUSTOM_INTERVALS, workMeters: 400 }}
        onCustom={onCustom}
      />
    );
    expect(screen.getByText('400 m')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Increase Run'));
    expect(onCustom).toHaveBeenLastCalledWith({
      ...DEFAULT_CUSTOM_INTERVALS,
      workMeters: 500,
    });
  });

  it('leaves distance out indoors', () => {
    render(
      <IntervalSetup
        choice="custom"
        onChoice={jest.fn()}
        custom={DEFAULT_CUSTOM_INTERVALS}
        onCustom={jest.fn()}
        distanceAllowed={false}
      />
    );
    expect(screen.queryByText('By distance')).toBeNull();
    expect(
      screen.getByText(
        'Distance repeats need GPS, so they are only offered outdoors.'
      )
    ).toBeTruthy();
  });
});

describe('IntervalSetup miles', () => {
  const distanceCustom = { ...DEFAULT_CUSTOM_INTERVALS, workMeters: 400 };

  it('offers Meters / Miles only when the distance unit is miles', () => {
    const { rerender } = render(
      <IntervalSetup
        choice="custom"
        onChoice={jest.fn()}
        custom={distanceCustom}
        onCustom={jest.fn()}
      />
    );
    expect(screen.queryByText('Miles')).toBeNull();
    rerender(
      <IntervalSetup
        choice="custom"
        onChoice={jest.fn()}
        custom={distanceCustom}
        onCustom={jest.fn()}
        milesAvailable
      />
    );
    expect(screen.getByText('Miles')).toBeTruthy();
  });

  it('switches to a quarter mile and steps by quarter miles', () => {
    const onCustom = jest.fn();
    const { rerender } = render(
      <IntervalSetup
        choice="custom"
        onChoice={jest.fn()}
        custom={distanceCustom}
        onCustom={onCustom}
        milesAvailable
      />
    );
    fireEvent.press(screen.getByText('Miles'));
    expect(onCustom).toHaveBeenLastCalledWith({
      ...DEFAULT_CUSTOM_INTERVALS,
      workMeters: 402,
      workUnit: 'mi',
    });
    rerender(
      <IntervalSetup
        choice="custom"
        onChoice={jest.fn()}
        custom={{ ...distanceCustom, workMeters: 402, workUnit: 'mi' }}
        onCustom={onCustom}
        milesAvailable
      />
    );
    expect(screen.getByText('0.25 mi')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Increase Run'));
    expect(onCustom).toHaveBeenLastCalledWith({
      ...DEFAULT_CUSTOM_INTERVALS,
      workMeters: 805,
      workUnit: 'mi',
    });
    fireEvent.press(screen.getByLabelText('Decrease Run'));
    // Never below a quarter mile.
    expect(onCustom).toHaveBeenLastCalledWith({
      ...DEFAULT_CUSTOM_INTERVALS,
      workMeters: 402,
      workUnit: 'mi',
    });
  });
});
