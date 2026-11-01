import {
  advanceProgress,
  findProgram,
  planMinutes,
  PICKER_PROGRAMS,
  programActivity,
  programOutline,
  programStatus,
  programVersions,
  RUN_PROGRAMS,
  isValidIntervalPlan,
  isZone2Program,
  isZoneCheckWorkout,
  planHasZone2,
  runMinutes,
  runProgramWorkoutSchema,
  ZONE2_CHECK_WEEKS,
} from '@workspace/shared';

const program = findProgram('beginner5k')!;

describe('beginner 5K', () => {
  test('is nine weeks of three workouts', () => {
    expect(program.weeks).toBe(9);
    expect(program.workoutsPerWeek).toBe(3);
    expect(program.workouts).toHaveLength(27);
    expect(program.workouts[0]).toMatchObject({ week: 0, day: 0 });
    expect(program.workouts[26]).toMatchObject({ week: 8, day: 2 });
  });

  test('every workout is a valid plan with a warm-up and cool-down', () => {
    for (const w of program.workouts) {
      expect(isValidIntervalPlan(w.plan)).toBe(true);
      expect(w.plan.steps[0].kind).toBe('warmup');
      expect(w.plan.steps[w.plan.steps.length - 1].kind).toBe('cooldown');
    }
  });

  test('builds up to 30 minutes of running', () => {
    const run = (i: number) =>
      program.workouts[i].plan.steps
        .filter((s) => s.kind === 'work')
        .reduce((sum, s) => sum + s.seconds, 0);
    expect(run(0)).toBe(8 * 60);
    expect(run(26)).toBe(30 * 60);
    expect(planMinutes(program.workouts[26].plan)).toBe(40);
  });

  test('total running never drops from one week to the next by much', () => {
    const run = (i: number) =>
      program.workouts[i].plan.steps
        .filter((s) => s.kind === 'work')
        .reduce((sum, s) => sum + s.seconds, 0);
    for (let week = 1; week < 9; week++) {
      expect(run(week * 3 + 2)).toBeGreaterThanOrEqual(run((week - 1) * 3));
    }
  });
});

describe('progress', () => {
  test('resolves the next workout', () => {
    const status = programStatus({ programId: 'beginner5k', next: 4 })!;
    expect(status.workout).toMatchObject({ week: 1, day: 1 });
    expect(status.done).toBe(4);
    expect(status.finished).toBe(false);
  });

  test('is finished at the end and clamps a stale index', () => {
    expect(programStatus({ programId: 'beginner5k', next: 999 })).toMatchObject(
      {
        finished: true,
        workout: null,
        done: 27,
      }
    );
    expect(programStatus({ programId: 'beginner5k', next: -3 })!.done).toBe(0);
  });

  test('knows nothing of an unknown program', () => {
    expect(programStatus({ programId: 'gone', next: 0 })).toBeNull();
  });

  test('advances only past the workout that is due', () => {
    const progress = { programId: 'beginner5k', next: 2 };
    expect(advanceProgress(progress, 2).next).toBe(3);
    expect(advanceProgress(progress, 5)).toBe(progress);
    expect(advanceProgress(progress, 1)).toBe(progress);
  });
});

describe('every program', () => {
  test('is listed once, easiest first, and can be found by id', () => {
    expect(RUN_PROGRAMS.map((p) => p.id)).toEqual([
      'walkFit',
      'walk10k',
      'returnToRunning',
      'gentle5k',
      'beginner5k',
      'fiveToTenK',
      'zone2Base',
      'zone2Base4',
      'faster5k',
      'beginner10k',
      'faster10k',
      'tenKToHalf',
      'tenKToHalf4',
      'halfMarathon',
      'halfMarathon4',
      'fasterHalf',
      'fasterHalf4',
      'beginnerMarathon',
      'beginnerMarathon4',
      'marathon',
      'advancedMarathon',
    ]);
    for (const p of RUN_PROGRAMS) expect(findProgram(p.id)).toBe(p);
  });

  test.each([
    ['walkFit', 8, 24],
    ['walk10k', 10, 30],
    ['returnToRunning', 4, 12],
    ['gentle5k', 12, 36],
    ['beginner5k', 9, 27],
    ['fiveToTenK', 8, 24],
    ['zone2Base', 10, 30],
    ['zone2Base4', 10, 40],
    ['faster5k', 6, 18],
    ['beginner10k', 12, 36],
    ['faster10k', 8, 24],
    ['tenKToHalf', 10, 30],
    ['tenKToHalf4', 10, 39],
    ['halfMarathon', 12, 36],
    ['halfMarathon4', 12, 47],
    ['fasterHalf', 10, 30],
    ['fasterHalf4', 10, 39],
    ['beginnerMarathon', 18, 54],
    ['beginnerMarathon4', 18, 71],
    ['marathon', 16, 63],
    ['advancedMarathon', 16, 78],
  ])('%s has %i weeks and %i workouts', (id, weeks, total) => {
    const p = findProgram(id)!;
    expect(p.weeks).toBe(weeks);
    expect(p.workouts).toHaveLength(total);
    expect(new Set(p.workouts.map((w) => w.week)).size).toBe(weeks);
  });

  test('every workout is a valid plan and workouts follow in order', () => {
    for (const p of RUN_PROGRAMS) {
      let last = -1;
      for (const w of p.workouts) {
        expect(isValidIntervalPlan(w.plan)).toBe(true);
        expect(w.plan.steps[0].kind).toBe('warmup');
        expect(w.plan.steps[w.plan.steps.length - 1].kind).toBe('cooldown');
        expect(w.week).toBeGreaterThanOrEqual(last);
        last = w.week;
      }
    }
  });

  test('the long runs build up and stay under four hours', () => {
    const longest = (id: string) =>
      Math.max(
        ...findProgram(id)!.workouts.map((w) =>
          Math.max(...w.plan.steps.map((s) => s.seconds))
        )
      );
    expect(longest('fiveToTenK')).toBe(65 * 60);
    expect(longest('halfMarathon')).toBe(115 * 60);
    expect(longest('marathon')).toBe(165 * 60);
    expect(longest('walk10k')).toBe(105 * 60);
    expect(longest('beginner10k')).toBe(60 * 60);
    expect(longest('tenKToHalf')).toBe(115 * 60);
    expect(longest('fasterHalf')).toBe(110 * 60);
    expect(longest('beginnerMarathon')).toBe(150 * 60);
    // The advanced marathon's long runs are split into an easy part and a
    // marathon-pace block, so measure the whole workout without its warm-up
    // and cool-down.
    const longestRun = Math.max(
      ...findProgram('advancedMarathon')!.workouts.map((w) =>
        w.plan.steps
          .filter((s) => s.kind === 'work' || s.kind === 'recovery')
          .reduce((sum, s) => sum + s.seconds, 0)
      )
    );
    expect(longestRun).toBe(180 * 60);
    for (const p of RUN_PROGRAMS) {
      expect(longest(p.id)).toBeLessThanOrEqual(4 * 3600);
    }
  });

  test('the four-run and longer plans keep the long run under half the week', () => {
    for (const id of [
      'zone2Base4',
      'tenKToHalf4',
      'halfMarathon4',
      'fasterHalf4',
      'beginnerMarathon4',
      'marathon',
      'advancedMarathon',
    ]) {
      const p = findProgram(id)!;
      // The last week is race week, with a shorter schedule.
      for (let week = 0; week < p.weeks - 1; week++) {
        const minutes = p.workouts
          .filter((w) => w.week === week)
          .map((w) => w.plan.steps.reduce((sum, s) => sum + s.seconds, 0));
        const total = minutes.reduce((sum, m) => sum + m, 0);
        expect(Math.max(...minutes) / total).toBeLessThan(0.5);
      }
    }
  });

  test('the speed plan is called fast and easy, the others run and walk', () => {
    expect(findProgram('faster5k')!.workouts[0].plan.style).toBe('fastEasy');
    expect(findProgram('marathon')!.workouts[0].plan.style).toBe('runWalk');
    expect(findProgram('faster10k')!.workouts[0].plan.style).toBe('fastEasy');
  });

  test('the new walking program is recorded as a walk', () => {
    expect(programActivity('walk10k')).toBe('walk');
    expect(programActivity('returnToRunning')).toBe('run');
  });

  test('an easy run in the speed plan is an easy step, not a run', () => {
    const easyDay = findProgram('faster5k')!.workouts[1].plan.steps;
    expect(easyDay.map((s) => s.kind)).toEqual([
      'warmup',
      'recovery',
      'cooldown',
    ]);
  });
});

describe('step efforts', () => {
  const stepsOf = (id: string) =>
    findProgram(id)!.workouts.flatMap((w) => w.plan.steps);

  test('efforts survive the schema a stored program is read back through', () => {
    for (const id of ['faster10k', 'advancedMarathon']) {
      for (const workout of findProgram(id)!.workouts) {
        expect(runProgramWorkoutSchema.parse(workout)).toEqual(workout);
      }
    }
  });

  test('the runs of a run/walk plan are tagged as easy running', () => {
    const work = stepsOf('beginner5k').filter((s) => s.kind === 'work');
    expect(work.length).toBeGreaterThan(0);
    expect(work.every((s) => s.effort === 'easy')).toBe(true);
  });

  test('strides are 20 second efforts, and only the faster plans have them', () => {
    for (const id of ['faster10k', 'fasterHalf', 'advancedMarathon']) {
      const strides = stepsOf(id).filter((s) => s.effort === 'stride');
      expect(strides.length).toBeGreaterThan(0);
      expect(strides.every((s) => s.kind === 'work' && s.seconds === 20)).toBe(
        true
      );
    }
    expect(stepsOf('beginner5k').some((s) => s.effort === 'stride')).toBe(
      false
    );
  });

  test('tempo runs are single steady efforts of 15 to 35 minutes', () => {
    for (const id of [
      'faster5k',
      'faster10k',
      'fasterHalf',
      'advancedMarathon',
    ]) {
      const tempo = stepsOf(id).filter((s) => s.effort === 'tempo');
      expect(tempo.length).toBeGreaterThan(0);
      for (const step of tempo) {
        expect(step.seconds).toBeGreaterThanOrEqual(15 * 60);
        expect(step.seconds).toBeLessThanOrEqual(35 * 60);
      }
    }
  });

  test('hill repeats are only in the plans that name them, 45 to 75 seconds up', () => {
    for (const id of ['faster10k', 'fasterHalf', 'advancedMarathon']) {
      const hills = stepsOf(id).filter((s) => s.effort === 'hill');
      expect(hills.length).toBeGreaterThan(0);
      for (const step of hills) {
        expect(step.seconds).toBeGreaterThanOrEqual(45);
        expect(step.seconds).toBeLessThanOrEqual(75);
      }
    }
    expect(stepsOf('marathon').some((s) => s.effort === 'hill')).toBe(false);
  });

  test('marathon-pace blocks are in the advanced marathon long runs, 40 to 50 minutes', () => {
    const blocks = stepsOf('advancedMarathon').filter(
      (s) => s.effort === 'marathon'
    );
    expect(blocks).toHaveLength(5);
    expect(blocks.map((s) => s.seconds / 60)).toEqual([40, 40, 50, 50, 40]);
    expect(stepsOf('halfMarathon').some((s) => s.effort === 'marathon')).toBe(
      false
    );
  });
});

describe('program versions', () => {
  test('a four-run version names the three-run program it belongs to', () => {
    for (const id of [
      'tenKToHalf',
      'halfMarathon',
      'fasterHalf',
      'beginnerMarathon',
    ]) {
      const versions = programVersions(id);
      expect(versions.map((p) => p.id)).toEqual([id, `${id}4`]);
      expect(versions.map((p) => p.workoutsPerWeek)).toEqual([3, 4]);
      expect(findProgram(`${id}4`)!.variantOf).toBe(id);
      expect(PICKER_PROGRAMS.map((p) => p.id)).not.toContain(`${id}4`);
      expect(PICKER_PROGRAMS.map((p) => p.id)).toContain(id);
    }
  });

  test('a program with no other version is its own only version', () => {
    expect(programVersions('beginner5k').map((p) => p.id)).toEqual([
      'beginner5k',
    ]);
  });
});

describe('the walking program', () => {
  test('is recorded as a walk, with brisk and easy steps and no running wording', () => {
    const p = findProgram('walkFit')!;
    expect(p.activity).toBe('walk');
    expect(programActivity('walkFit')).toBe('walk');
    expect(programActivity('beginner5k')).toBe('run');
    expect(programActivity('gone')).toBe('run');
    for (const w of p.workouts) expect(w.plan.style).toBe('briskWalk');
    expect(runProgramWorkoutSchema.parse(p.workouts[0])).toEqual(p.workouts[0]);
  });

  test('builds to half an hour of brisk walking and never repeats the first week', () => {
    const p = findProgram('walkFit')!;
    const brisk = (i: number) =>
      p.workouts[i].plan.steps
        .filter((s) => s.kind === 'work')
        .reduce((sum, s) => sum + s.seconds, 0);
    expect(brisk(0)).toBe(12 * 60);
    expect(brisk(p.workouts.length - 1)).toBe(30 * 60);
    expect(brisk(p.workouts.length - 1)).toBeGreaterThan(brisk(0));
  });

  test('the card quotes brisk minutes for a walk and running minutes for a run', () => {
    const outline = (id: string) => programOutline(findProgram(id)!);
    expect(outline('walkFit')).toEqual({
      firstWeek: [12, 12, 12],
      peakRunMinutes: 30,
    });
    expect(outline('walk10k')).toMatchObject({
      firstWeek: [30, 30, 40],
      peakRunMinutes: 105,
    });
    expect(outline('halfMarathon')).toEqual({
      firstWeek: [30, 30, 50],
      peakRunMinutes: 115,
    });
    expect(outline('halfMarathon4').peakRunMinutes).toBe(115);
    expect(outline('tenKToHalf4').peakRunMinutes).toBe(115);
    expect(outline('fasterHalf').peakRunMinutes).toBe(110);
    expect(outline('fasterHalf4').peakRunMinutes).toBe(110);
    expect(outline('beginnerMarathon4').peakRunMinutes).toBe(150);
    expect(outline('advancedMarathon').peakRunMinutes).toBe(180);
    const easyDay = findProgram('faster5k')!.workouts[1].plan;
    expect(runMinutes(easyDay)).toBe(30);
    expect(runMinutes(findProgram('walkFit')!.workouts[0].plan)).toBe(12);
  });

  test('beginner 10k eases off in week 10 and still peaks at an hour', () => {
    const p = findProgram('beginner10k')!;
    const longest = (week: number) =>
      Math.max(
        ...p.workouts
          .filter((w) => w.week === week)
          .map((w) =>
            w.plan.steps
              .filter((s) => s.kind === 'work')
              .reduce((sum, s) => sum + s.seconds, 0)
          )
      );
    expect(longest(8)).toBe(40 * 60);
    expect(longest(9)).toBe(30 * 60);
    expect(longest(10)).toBe(50 * 60);
    expect(longest(11)).toBe(60 * 60);
  });

  test('a stored program carries the activity', () => {
    const status = programStatus({ programId: 'walkFit', next: 0 })!;
    expect(status.program.activity).toBe('walk');
  });
});

describe('Zone 2 base', () => {
  const three = findProgram('zone2Base')!;
  const four = findProgram('zone2Base4')!;
  const zoneMinutes = (p: typeof three, week: number) =>
    p.workouts
      .filter((w) => w.week === week)
      .flatMap((w) => w.plan.steps)
      .filter((s) => s.effort === 'zone2')
      .reduce((sum, s) => sum + s.seconds, 0) / 60;

  test('is a three-run program with a four-run version the picker offers', () => {
    expect(three.workoutsPerWeek).toBe(3);
    expect(four.workoutsPerWeek).toBe(4);
    expect(four.variantOf).toBe('zone2Base');
    expect(PICKER_PROGRAMS.map((p) => p.id)).toContain('zone2Base');
    expect(PICKER_PROGRAMS.map((p) => p.id)).not.toContain('zone2Base4');
    expect(programVersions('zone2Base').map((p) => p.id)).toEqual([
      'zone2Base',
      'zone2Base4',
    ]);
    expect(isZone2Program('zone2Base4')).toBe(true);
    expect(isZone2Program('beginner5k')).toBe(false);
  });

  test.each(['zone2Base', 'zone2Base4'])(
    '%s runs every workout by Zone 2 effort, not pace, with no hard work',
    (id) => {
      const p = findProgram(id)!;
      for (const w of p.workouts) {
        expect(isValidIntervalPlan(w.plan)).toBe(true);
        expect(planHasZone2(w.plan)).toBe(true);
        expect(w.plan.style).toBe('runWalk');
        for (const step of w.plan.steps) {
          expect(step.pace).toBeUndefined();
          expect(['tempo', 'marathon', 'hill']).not.toContain(step.effort);
        }
      }
    }
  );

  test('time in zone grows, with easier fourth and eighth weeks', () => {
    for (const p of [three, four]) {
      const totals = Array.from({ length: p.weeks }, (_, w) =>
        zoneMinutes(p, w)
      );
      expect(totals[3]).toBeLessThan(totals[2]);
      expect(totals[7]).toBeLessThan(totals[6]);
      expect(totals[8]).toBeGreaterThan(totals[0] * 1.4);
      // Outside the easier weeks nothing steps up by more than 15 percent.
      for (let w = 1; w < p.weeks; w++) {
        if (w === 4 || w === 8) continue;
        expect(totals[w]).toBeLessThanOrEqual(totals[w - 1] * 1.15);
      }
    }
  });

  test('has one longer run a week, the last workout, under half the week', () => {
    for (const p of [three, four]) {
      for (let w = 0; w < p.weeks; w++) {
        const days = p.workouts.filter((x) => x.week === w);
        const minutes = days.map((d) => runMinutes(d.plan));
        expect(minutes[minutes.length - 1]).toBe(Math.max(...minutes));
        expect(
          Math.max(...minutes) / minutes.reduce((a, b) => a + b, 0)
        ).toBeLessThan(0.5);
      }
    }
    expect(
      Math.max(...three.workouts.map((w) => runMinutes(w.plan)))
    ).toBeLessThanOrEqual(75);
  });

  test('strides, where present, are a few short efforts at the end of an easy run', () => {
    const withStrides = three.workouts.filter((w) =>
      w.plan.steps.some((s) => s.effort === 'stride')
    );
    expect(withStrides.map((w) => [w.week, w.day])).toEqual([
      [5, 0],
      [6, 0],
      [8, 0],
    ]);
    for (const w of withStrides) {
      const strides = w.plan.steps.filter((s) => s.effort === 'stride');
      expect(strides).toHaveLength(4);
      expect(strides.every((s) => s.seconds === 20)).toBe(true);
      expect(w.plan.steps[1].effort).toBe('zone2');
    }
  });

  test('the middle run of weeks 4, 8 and 10 is the zone check', () => {
    expect(ZONE2_CHECK_WEEKS).toEqual([3, 7, 9]);
    for (const p of [three, four]) {
      const checks = p.workouts.filter((w) => isZoneCheckWorkout(p.id, w));
      expect(checks.map((w) => [w.week, w.day])).toEqual([
        [3, 1],
        [7, 1],
        [9, 1],
      ]);
    }
    expect(isZoneCheckWorkout('beginner5k', { week: 3, day: 1 })).toBe(false);
  });
});
