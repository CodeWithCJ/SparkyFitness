import { createInstance } from 'i18next';
import {
  checkInCue,
  eventCue,
  finishCue,
  heartRateAlertCue,
  paceAlertCue,
  intervalCue,
  intervalToGoCue,
  spokenDuration,
  splitCue,
  stepDistanceText,
  stepToGoMeters,
  halfwayCue,
  lastMinuteCue,
  milestoneCue,
  programDoneCue,
  programStartCue,
  splitTrendNote,
  stepCountdownCue,
  stepWarningCue,
} from '../../src/utils/recordingCues';

// Falls back to the English defaults, which is what the cues are written in.
const t = createInstance();
void t.init({
  lng: 'en',
  resources: {},
  interpolation: { escapeValue: false },
});
const tt = t.t.bind(t);

describe('spokenDuration', () => {
  it('spells out minutes and seconds', () => {
    expect(spokenDuration(tt, 324)).toBe('5 minutes 24 seconds');
  });

  it('drops zero parts and uses singulars', () => {
    expect(spokenDuration(tt, 3600 + 60 + 1)).toBe('1 hour 1 minute 1 second');
    expect(spokenDuration(tt, 600)).toBe('10 minutes');
  });

  it('says zero seconds rather than nothing', () => {
    expect(spokenDuration(tt, 0)).toBe('0 seconds');
  });
});

describe('splitCue', () => {
  it('announces distance, total time and the last split', () => {
    expect(
      splitCue(tt, {
        completed: 3,
        totalSeconds: 972,
        splitSeconds: 324,
        unit: 'km',
      })
    ).toBe(
      '3 kilometers. Time 16 minutes 12 seconds. Last kilometer 5 minutes 24 seconds.'
    );
  });

  it('speaks in miles when asked', () => {
    expect(
      splitCue(tt, {
        completed: 1,
        totalSeconds: 540,
        splitSeconds: 540,
        unit: 'miles',
      })
    ).toBe('1 mile. Time 9 minutes. Last mile 9 minutes.');
  });
});

describe('eventCue and finishCue', () => {
  it('says what happened', () => {
    expect(eventCue(tt, 'autoPaused')).toBe('Auto paused');
    expect(eventCue(tt, 'resumed')).toBe('Resumed');
  });

  it('rounds the finishing distance to one decimal', () => {
    expect(
      finishCue(tt, { distanceMeters: 5234, totalSeconds: 1800, unit: 'km' })
    ).toBe('Recording finished. 5.2 kilometers. Time 30 minutes.');
  });
});

describe('paceAlertCue', () => {
  it('tells the runner which way to go', () => {
    expect(paceAlertCue(tt, 'tooFast')).toBe('Too fast. Ease off.');
    expect(paceAlertCue(tt, 'tooSlow')).toBe('Too slow. Pick it up.');
  });
});

describe('heartRateAlertCue', () => {
  it('tells the runner which way to go', () => {
    expect(heartRateAlertCue(tt, 'tooHigh')).toBe('Heart rate high. Ease off.');
    expect(heartRateAlertCue(tt, 'tooLow')).toBe('Heart rate low. Pick it up.');
  });
});

describe('distance steps', () => {
  it('shows and says a step in the unit it was set in', () => {
    expect(stepDistanceText(tt, 400)).toBe('400 m');
    expect(stepDistanceText(tt, 1500)).toBe('1.5 km');
    expect(stepDistanceText(tt, 402, 'mi')).toBe('0.25 mi');
    expect(stepDistanceText(tt, 1609, 'mi')).toBe('1 mi');
    expect(
      intervalCue(tt, {
        step: { kind: 'work', seconds: 145, meters: 402, unit: 'mi' },
        style: 'fastEasy',
      })
    ).toBe('Fast. 0.25 miles.');
    expect(
      intervalCue(tt, {
        step: { kind: 'work', seconds: 144, meters: 400 },
        style: 'fastEasy',
      })
    ).toBe('Fast. 400 meters.');
  });

  it('says the last tenth of a mile on a step set in miles', () => {
    expect(intervalToGoCue(tt)).toBe('100 meters to go.');
    expect(intervalToGoCue(tt, 'mi')).toBe('0.1 miles to go.');
    expect(stepToGoMeters('mi')).toBeCloseTo(160.9, 1);
  });
});

describe('coaching cues', () => {
  const next = { kind: 'work', seconds: 180 } as const;

  it('warns ahead of a step and names it', () => {
    expect(stepWarningCue(tt, { next, style: 'fastEasy' })).toBe(
      'Ten seconds. Next, Fast.'
    );
    expect(stepWarningCue(tt, { next: null, style: 'fastEasy' })).toBe(
      'Ten seconds to go.'
    );
  });

  it('calls halfway and the last minute', () => {
    expect(halfwayCue(tt)).toBe('Halfway there. Keep it up.');
    expect(lastMinuteCue(tt)).toBe('One minute left. Finish strong.');
  });

  it('gives time, distance and average pace outdoors', () => {
    expect(
      checkInCue(tt, {
        totalSeconds: 600,
        distanceMeters: 1650,
        secondsPerUnit: 364,
        unit: 'km',
      })
    ).toBe(
      '10 minutes. 1.7 kilometers. Average pace 6 minutes 4 seconds per kilometer.'
    );
  });

  it('says pace per mile for miles', () => {
    expect(
      checkInCue(tt, {
        totalSeconds: 600,
        distanceMeters: 1609.344,
        secondsPerUnit: 600,
        unit: 'miles',
      })
    ).toBe('10 minutes. 1 mile. Average pace 10 minutes per mile.');
  });

  it('gives only the time indoors', () => {
    expect(
      checkInCue(tt, {
        totalSeconds: 1200,
        distanceMeters: null,
        secondsPerUnit: null,
        unit: 'km',
      })
    ).toBe('20 minutes done.');
  });
});

describe('split trend', () => {
  it('says how much faster or slower than the split before', () => {
    expect(splitTrendNote(tt, 300, 312)).toBe(
      '12 seconds faster than the one before.'
    );
    expect(splitTrendNote(tt, 330, 300)).toBe(
      '30 seconds slower than the one before.'
    );
  });

  it('stays quiet for about the same, or for the first split', () => {
    expect(splitTrendNote(tt, 300, 303)).toBeNull();
    expect(splitTrendNote(tt, 300, undefined)).toBeNull();
  });

  it('is added to the split cue', () => {
    expect(
      splitCue(tt, {
        completed: 2,
        totalSeconds: 600,
        splitSeconds: 290,
        previousSplitSeconds: 310,
        unit: 'km',
      })
    ).toBe(
      '2 kilometers. Time 10 minutes. Last kilometer 4 minutes 50 seconds. 20 seconds faster than the one before.'
    );
  });
});

describe('program cues', () => {
  it('opens a workout with its place and length', () => {
    expect(
      programStartCue(tt, {
        activity: 'run',
        week: 2,
        day: 3,
        totalSeconds: 1500,
        eased: false,
      })
    ).toBe('Week 2, run 3. 25 minutes.');
  });

  it('says when it was eased, and uses walk for a walking program', () => {
    expect(
      programStartCue(tt, {
        activity: 'walk',
        week: 1,
        day: 2,
        totalSeconds: 1200,
        eased: true,
      })
    ).toBe('Week 1, walk 2. 20 minutes. Eased for today.');
  });

  it('closes a workout with progress and what is next', () => {
    expect(
      programDoneCue(tt, {
        activity: 'run',
        done: 4,
        total: 27,
        next: { week: 2, day: 2 },
      })
    ).toBe('Workout 4 of 27 done. Next up, Week 2, run 2.');
  });

  it('congratulates on the last workout', () => {
    expect(
      programDoneCue(tt, { activity: 'run', done: 27, total: 27, next: null })
    ).toBe('Program complete. Well done.');
  });
});

describe('countdown and milestone cues', () => {
  it('counts down in one breath', () => {
    expect(stepCountdownCue(tt)).toBe('Three. Two. One.');
  });

  it('names each milestone distance', () => {
    expect(milestoneCue(tt, 5000)).toBe('5K done. Nice work.');
    expect(milestoneCue(tt, 10000)).toBe('10K done. Strong effort.');
    expect(milestoneCue(tt, 21097.5)).toBe('Half marathon distance. Amazing.');
    expect(milestoneCue(tt, 42195)).toBe('Marathon distance. Incredible.');
  });
});
