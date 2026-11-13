import { describe, expect, it } from 'vitest';
import {
  adherenceBar,
  adherenceTier,
  computeAdherence,
  computeChecklistProgress,
  dayDoseTotal,
  dayLogStatus,
  entryMatchesDue,
  monthDoseTotal,
  tallyEntriesByDay,
  tallySymptomsByDay,
  type AdherenceEntry,
  type SharedMedication,
} from '@workspace/shared';

const TZ = 'UTC';

const daily = (id: string, time = '08:00') => ({
  id,
  schedule_type_id: 'daily',
  time_of_day: time,
  start_date: '2026-01-01',
});

const med = (
  id: string,
  schedules: SharedMedication['schedules'] = [daily(`${id}-s1`)]
): SharedMedication => ({ id, is_active: true, schedules });

const entry = (overrides: Partial<AdherenceEntry> = {}): AdherenceEntry => ({
  medication_id: 'med-1',
  schedule_id: 'med-1-s1',
  status: 'taken',
  entry_date: '2026-10-14',
  ...overrides,
});

describe('entryMatchesDue', () => {
  const due = { medication: { id: 'med-123' }, schedule: { id: 'sched-456' } };
  const base = (o: Partial<AdherenceEntry>): AdherenceEntry => ({
    medication_id: 'med-123',
    schedule_id: 'sched-456',
    status: 'taken',
    entry_date: '2026-07-28',
    entry_type: 'entry',
    ...o,
  });

  it('matches when schedule_id matches the due schedule', () => {
    expect(entryMatchesDue(base({}), due)).toBe(true);
  });

  it('matches schedule-less entries for the same medication', () => {
    expect(entryMatchesDue(base({ schedule_id: null }), due)).toBe(true);
  });

  it('matches injection entries for the same medication', () => {
    expect(
      entryMatchesDue(base({ schedule_id: null, entry_type: 'injection' }), due)
    ).toBe(true);
  });

  it('never matches PRN entries to a scheduled dose', () => {
    expect(entryMatchesDue(base({ status: 'prn_taken' }), due)).toBe(false);
    expect(
      entryMatchesDue(base({ status: 'prn_taken', schedule_id: null }), due)
    ).toBe(false);
  });

  it('does not match another medication', () => {
    expect(
      entryMatchesDue(
        base({ medication_id: 'med-999', schedule_id: null }),
        due
      )
    ).toBe(false);
  });
});

describe('computeChecklistProgress', () => {
  const meds = [med('med-1'), med('med-2')];
  const dues = [
    { medication: { id: 'med-1' }, schedule: { id: 'med-1-s1' } },
    { medication: { id: 'med-2' }, schedule: { id: 'med-2-s1' } },
  ];

  it('counts taken and skipped doses as logged', () => {
    const progress = computeChecklistProgress(dues, [
      entry(),
      entry({
        medication_id: 'med-2',
        schedule_id: 'med-2-s1',
        status: 'skipped',
      }),
    ]);
    expect(progress).toEqual({ completed: 2, total: 2, pct: 100 });
    expect(meds).toHaveLength(2);
  });

  it('does not count snoozed doses', () => {
    expect(
      computeChecklistProgress(dues, [entry({ status: 'snoozed' })]).completed
    ).toBe(0);
  });

  it('reads as complete when nothing is due', () => {
    expect(computeChecklistProgress([], [])).toEqual({
      completed: 0,
      total: 0,
      pct: 100,
    });
  });

  it('rounds partial progress', () => {
    expect(computeChecklistProgress(dues, [entry()]).pct).toBe(50);
  });
});

describe('computeAdherence', () => {
  const end = '2026-10-14';

  it('scores a fully taken window as 100% with a full streak', () => {
    const entries: AdherenceEntry[] = [];
    for (let d = 1; d <= 14; d++) {
      entries.push(
        entry({ entry_date: `2026-10-${String(d).padStart(2, '0')}` })
      );
    }
    const result = computeAdherence({
      medications: [med('med-1')],
      entries,
      endDate: end,
      timezone: TZ,
    });
    expect(result.days).toHaveLength(14);
    expect(result.days[0]?.date).toBe('2026-10-01');
    expect(result.days[13]?.date).toBe(end);
    expect(result).toMatchObject({
      due: 14,
      taken: 14,
      pct: 100,
      perfectDays: 14,
      streak: 14,
    });
  });

  it('reports 100% when nothing was ever due', () => {
    const result = computeAdherence({
      medications: [],
      entries: [],
      endDate: end,
      timezone: TZ,
    });
    expect(result).toMatchObject({
      due: 0,
      taken: 0,
      pct: 100,
      perfectDays: 0,
      streak: 0,
    });
    expect(result.days.every((d) => d.pct === -1)).toBe(true);
  });

  it('does not break the streak while today is still open', () => {
    // 13 perfect days before today, today untouched.
    const entries: AdherenceEntry[] = [];
    for (let d = 1; d <= 13; d++) {
      entries.push(
        entry({ entry_date: `2026-10-${String(d).padStart(2, '0')}` })
      );
    }
    const result = computeAdherence({
      medications: [med('med-1')],
      entries,
      endDate: end,
      timezone: TZ,
    });
    expect(result.streak).toBe(13);
    expect(result.perfectDays).toBe(13);
    expect(result.pct).toBe(93);
  });

  it('breaks the streak on a skipped dose, today included', () => {
    const entries: AdherenceEntry[] = [
      entry({ entry_date: '2026-10-12' }),
      entry({ entry_date: '2026-10-13' }),
      entry({ entry_date: end, status: 'skipped' }),
    ];
    const result = computeAdherence({
      medications: [med('med-1')],
      entries,
      endDate: end,
      timezone: TZ,
    });
    expect(result.streak).toBe(0);
  });

  it('stops the streak at the first missed day', () => {
    const entries: AdherenceEntry[] = [
      entry({ entry_date: '2026-10-11' }),
      // 10-12 missed
      entry({ entry_date: '2026-10-13' }),
      entry({ entry_date: end }),
    ];
    const result = computeAdherence({
      medications: [med('med-1')],
      entries,
      endDate: end,
      timezone: TZ,
    });
    expect(result.streak).toBe(2);
  });

  it('lets as-needed doses top up a day, capped at the due count', () => {
    const result = computeAdherence({
      medications: [med('med-1')],
      entries: [
        entry({ status: 'prn_taken', schedule_id: null, entry_date: end }),
        entry({ status: 'prn_taken', schedule_id: null, entry_date: end }),
      ],
      endDate: end,
      timezone: TZ,
      windowDays: 1,
    });
    expect(result.days[0]).toMatchObject({
      due: 1,
      taken: 0,
      prnTaken: 2,
      pct: 100,
    });
    expect(result.taken).toBe(1);
  });

  it('counts a PRN-only day as one perfect dose', () => {
    const result = computeAdherence({
      medications: [med('med-1', [])],
      entries: [
        entry({ status: 'prn_taken', schedule_id: null, entry_date: end }),
      ],
      endDate: end,
      timezone: TZ,
      windowDays: 3,
    });
    expect(result).toMatchObject({
      due: 1,
      taken: 1,
      perfectDays: 1,
      streak: 1,
    });
  });

  it('ignores skipped and snoozed entries when counting taken doses', () => {
    const result = computeAdherence({
      medications: [med('med-1')],
      entries: [entry({ status: 'snoozed', entry_date: end })],
      endDate: end,
      timezone: TZ,
      windowDays: 1,
    });
    expect(result.taken).toBe(0);
    expect(result.pct).toBe(0);
  });

  it('honours a custom window length', () => {
    const result = computeAdherence({
      medications: [med('med-1')],
      entries: [],
      endDate: end,
      timezone: TZ,
      windowDays: 7,
    });
    expect(result.days).toHaveLength(7);
    expect(result.due).toBe(7);
  });
});

describe('adherence presentation helpers', () => {
  it('bands the ring colour at 90 and 70', () => {
    expect(adherenceTier(100)).toBe('good');
    expect(adherenceTier(90)).toBe('good');
    expect(adherenceTier(89)).toBe('fair');
    expect(adherenceTier(70)).toBe('fair');
    expect(adherenceTier(69)).toBe('poor');
  });

  it('maps a day to a bar level and height', () => {
    const day = { date: '2026-10-14', due: 2, taken: 0, prnTaken: 0 };
    expect(adherenceBar({ ...day, due: 0, pct: -1 })).toEqual({
      level: 'idle',
      heightPct: 18,
    });
    expect(adherenceBar({ ...day, taken: 2, pct: 100 })).toEqual({
      level: 'full',
      heightPct: 100,
    });
    expect(adherenceBar({ ...day, taken: 1, pct: 50 })).toEqual({
      level: 'partial',
      heightPct: 50,
    });
    expect(adherenceBar({ ...day, pct: 0 })).toEqual({
      level: 'missed',
      heightPct: 14,
    });
    expect(
      adherenceBar({
        date: '2026-10-14',
        due: 0,
        taken: 0,
        prnTaken: 2,
        pct: 100,
      })
    ).toEqual({ level: 'full', heightPct: 80 });
  });
});

describe('month calendar helpers', () => {
  const entries: AdherenceEntry[] = [
    entry({ entry_date: '2026-10-01' }),
    entry({ entry_date: '2026-10-01', status: 'skipped' }),
    entry({ entry_date: '2026-10-02', status: 'prn_taken' }),
    entry({ entry_date: '2026-10-03', status: 'snoozed' }),
    entry({ entry_date: '2026-10-04', status: 'skipped' }),
    entry({ entry_date: '2026-09-30', medication_id: 'med-2' }),
  ];

  it('tallies doses per day', () => {
    const byDay = tallyEntriesByDay(entries);
    expect(byDay['2026-10-01']).toEqual({
      taken: 1,
      prn: 0,
      skipped: 1,
      snoozed: 0,
    });
    expect(byDay['2026-10-02']).toEqual({
      taken: 0,
      prn: 1,
      skipped: 0,
      snoozed: 0,
    });
    expect(Object.keys(byDay)).toHaveLength(5);
  });

  it('filters to one medication, or by an include predicate', () => {
    expect(
      Object.keys(tallyEntriesByDay(entries, { medicationId: 'med-2' }))
    ).toEqual(['2026-09-30']);
    const filtered = tallyEntriesByDay(entries, {
      include: (id) => id === 'med-1',
    });
    expect(filtered['2026-09-30']).toBeUndefined();
  });

  it('totals the doses taken in one month only', () => {
    const byDay = tallyEntriesByDay(entries);
    expect(monthDoseTotal(byDay, '2026-10')).toBe(2);
    expect(monthDoseTotal(byDay, '2026-09')).toBe(1);
  });

  it('classifies days by completion ratio', () => {
    expect(dayLogStatus({ taken: 2, prn: 0, skipped: 0, snoozed: 0 })).toBe(
      'all_taken'
    );
    expect(dayLogStatus({ taken: 1, prn: 1, skipped: 0, snoozed: 2 })).toBe(
      'all_taken'
    );
    expect(dayLogStatus({ taken: 1, prn: 0, skipped: 1, snoozed: 0 })).toBe(
      'partial'
    );
    expect(dayLogStatus({ taken: 1, prn: 0, skipped: 2, snoozed: 0 })).toBe(
      'mostly_skipped'
    );
    expect(dayLogStatus({ taken: 0, prn: 0, skipped: 2, snoozed: 0 })).toBe(
      'all_skipped'
    );
    expect(dayLogStatus({ taken: 0, prn: 0, skipped: 0, snoozed: 1 })).toBe(
      'snoozed_only'
    );
    expect(
      dayLogStatus({ taken: 0, prn: 0, skipped: 0, snoozed: 0 })
    ).toBeNull();
  });

  it('shows the dose badge count as taken plus as-needed', () => {
    expect(dayDoseTotal({ taken: 2, prn: 1, skipped: 4, snoozed: 1 })).toBe(3);
  });

  it('tolerates date-time entry dates', () => {
    const byDay = tallyEntriesByDay([
      entry({ entry_date: '2026-10-05T00:00:00.000Z' }),
    ]);
    expect(Object.keys(byDay)).toEqual(['2026-10-05']);
  });
});

describe('tallySymptomsByDay', () => {
  const symptoms = [
    {
      entry_date: '2026-10-01',
      medication_id: 'med-1',
      symptom_name_snapshot: 'Nausea',
    },
    {
      entry_date: '2026-10-01',
      medication_id: null,
      symptom_name_snapshot: 'Headache',
    },
    {
      entry_date: '2026-10-01',
      medication_id: 'med-1',
      symptom_name_snapshot: 'Nausea',
    },
    {
      entry_date: '2026-10-02',
      medication_id: 'med-2',
      symptom_name_snapshot: 'Fatigue',
    },
  ];

  it('treats any medication-linked symptom as a side effect when viewing all', () => {
    const byDay = tallySymptomsByDay(symptoms);
    expect(byDay['2026-10-01']).toEqual({
      sideEffect: true,
      general: true,
      names: ['Nausea', 'Headache'],
    });
    expect(byDay['2026-10-02']?.sideEffect).toBe(true);
  });

  it('only treats symptoms linked to the selected medication as side effects', () => {
    const byDay = tallySymptomsByDay(symptoms, { medicationId: 'med-1' });
    expect(byDay['2026-10-01']?.sideEffect).toBe(true);
    expect(byDay['2026-10-02']).toEqual({
      sideEffect: false,
      general: true,
      names: ['Fatigue'],
    });
  });

  it('drops symptoms linked to a medication the filter hides', () => {
    const byDay = tallySymptomsByDay(symptoms, {
      include: (id) => id === 'med-1',
    });
    expect(byDay['2026-10-02']).toBeUndefined();
    expect(byDay['2026-10-01']?.general).toBe(true);
  });

  it('never marks days with cycle-hub symptoms', () => {
    const byDay = tallySymptomsByDay([
      {
        entry_date: '2026-10-03',
        medication_id: null,
        symptom_name_snapshot: 'Cramps',
        source: 'cycle',
      },
    ]);
    expect(byDay).toEqual({});
  });
});
