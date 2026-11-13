import {
  buildCheckinCreateBody,
  buildCheckinUpdateBody,
  checkinEditChanged,
  defaultCheckinTime,
  draftFromEntry,
  hasCheckinContent,
  type CheckinDraft,
} from '@workspace/shared';
import type { MoodEntry } from '@/types/mood';

const TZ = 'America/Chicago';
const DAY = '2026-10-19';

const draft = (over: Partial<CheckinDraft> = {}): CheckinDraft => ({
  mood: null,
  energy: null,
  focus: null,
  notes: '',
  tags: [],
  time: '12:00',
  ...over,
});

// 14:30:27.123Z is 09:30:27 in Chicago (CDT, UTC-5). The seconds are what a
// stored instant carries and the HH:mm editor cannot show.
const entry = (over: Partial<MoodEntry> = {}): MoodEntry => ({
  id: 'e1',
  user_id: 'u1',
  mood_value: 60,
  mood_tags: ['calm', 'tired'],
  notes: 'Felt fine',
  energy_value: 3,
  focus_value: null,
  entry_date: DAY,
  entry_timestamp: '2026-10-19T14:30:27.123Z',
  source: 'manual',
  created_at: '2026-10-19T14:30:27.123Z',
  updated_at: '2026-10-19T14:30:27.123Z',
  ...over,
});

describe('hasCheckinContent', () => {
  test('is false for an empty draft, blank notes and blank tags', () => {
    expect(hasCheckinContent(draft())).toBe(false);
    expect(hasCheckinContent(draft({ notes: ' \n\t' }))).toBe(false);
    expect(hasCheckinContent(draft({ tags: ['', '  '] }))).toBe(false);
  });

  test('is true for any one of mood, energy, focus, notes or a tag', () => {
    expect(hasCheckinContent(draft({ mood: 10 }))).toBe(true);
    expect(hasCheckinContent(draft({ energy: 1 }))).toBe(true);
    expect(hasCheckinContent(draft({ focus: 5 }))).toBe(true);
    expect(hasCheckinContent(draft({ notes: ' ok ' }))).toBe(true);
    expect(hasCheckinContent(draft({ tags: ['', 'calm'] }))).toBe(true);
  });
});

describe('defaultCheckinTime', () => {
  test('is the current time in the zone when the day is today there', () => {
    expect(
      defaultCheckinTime(DAY, TZ, new Date('2026-10-19T14:05:00.000Z'))
    ).toBe('09:05');
    // Already the 20th in UTC, still the evening of the 19th in Chicago.
    expect(
      defaultCheckinTime(DAY, TZ, new Date('2026-10-20T03:15:00.000Z'))
    ).toBe('22:15');
  });

  test('is noon for any other day', () => {
    expect(
      defaultCheckinTime('2026-10-12', TZ, new Date('2026-10-19T14:05:00Z'))
    ).toBe('12:00');
  });
});

describe('draftFromEntry', () => {
  test('reads the values and the local time of a stored check-in', () => {
    expect(draftFromEntry(entry(), TZ)).toEqual({
      mood: 60,
      energy: 3,
      focus: null,
      notes: 'Felt fine',
      tags: ['calm', 'tired'],
      time: '09:30',
    });
  });

  test('reads a missing note as an empty one', () => {
    expect(draftFromEntry(entry({ notes: null }), TZ).notes).toBe('');
  });
});

describe('buildCheckinCreateBody', () => {
  test('an energy-only check-in sends energy, the day and the instant only', () => {
    expect(
      buildCheckinCreateBody(draft({ energy: 4, time: '08:10' }), DAY, TZ)
    ).toEqual({
      energy_value: 4,
      entry_date: DAY,
      entry_timestamp: '2026-10-19T13:10:00.000Z',
    });
  });

  test('omits whitespace-only notes and trims the rest', () => {
    expect(
      buildCheckinCreateBody(draft({ mood: 50, notes: '  ' }), DAY, TZ)
    ).not.toHaveProperty('notes');
    expect(
      buildCheckinCreateBody(draft({ mood: 50, notes: '  ok \n' }), DAY, TZ)
        .notes
    ).toBe('ok');
  });

  test('drops blank tags', () => {
    expect(
      buildCheckinCreateBody(draft({ tags: ['', 'calm'] }), DAY, TZ).mood_tags
    ).toEqual(['calm']);
    expect(
      buildCheckinCreateBody(draft({ mood: 50, tags: [' '] }), DAY, TZ)
    ).not.toHaveProperty('mood_tags');
  });

  test('keeps a late-evening check-in on its own day in the user zone', () => {
    const body = buildCheckinCreateBody(
      draft({ focus: 2, time: '23:30' }),
      DAY,
      TZ
    );
    expect(body.entry_timestamp).toBe('2026-10-20T04:30:00.000Z');
    expect(body.entry_date).toBe(DAY);
  });
});

describe('buildCheckinUpdateBody', () => {
  test('an untouched check-in sends nothing', () => {
    const stored = entry();
    expect(
      buildCheckinUpdateBody(stored, draftFromEntry(stored, TZ), DAY, TZ)
    ).toEqual({});
  });

  test('a cleared rating is sent as null', () => {
    const stored = entry({ energy_value: 3 });
    expect(
      buildCheckinUpdateBody(
        stored,
        { ...draftFromEntry(stored, TZ), energy: null },
        DAY,
        TZ
      )
    ).toEqual({ energy_value: null });
  });

  test('cleared mood, notes and tags are sent as null', () => {
    const stored = entry();
    expect(
      buildCheckinUpdateBody(
        stored,
        { ...draftFromEntry(stored, TZ), mood: null, notes: ' ', tags: [''] },
        DAY,
        TZ
      )
    ).toEqual({ mood_value: null, notes: null, mood_tags: null });
  });

  test('sends only the fields that changed', () => {
    const stored = entry();
    expect(
      buildCheckinUpdateBody(
        stored,
        {
          ...draftFromEntry(stored, TZ),
          mood: 75,
          focus: 4,
          notes: ' Felt better ',
          tags: ['tired', 'calm'],
        },
        DAY,
        TZ
      )
    ).toEqual({ mood_value: 75, focus_value: 4, notes: 'Felt better' });
  });

  test('a changed time sends the new instant and its day', () => {
    const stored = entry();
    expect(
      buildCheckinUpdateBody(
        stored,
        { ...draftFromEntry(stored, TZ), time: '10:45' },
        DAY,
        TZ
      )
    ).toEqual({
      entry_timestamp: '2026-10-19T15:45:00.000Z',
      entry_date: DAY,
    });
  });

  test('an unchanged time moves nothing, even when the stored instant has seconds', () => {
    const stored = entry({ entry_timestamp: '2026-10-19T14:30:59.999Z' });
    const body = buildCheckinUpdateBody(
      stored,
      { ...draftFromEntry(stored, TZ), energy: 5 },
      DAY,
      TZ
    );
    expect(body).toEqual({ energy_value: 5 });
    expect(body).not.toHaveProperty('entry_timestamp');
    expect(body).not.toHaveProperty('entry_date');
  });
});

describe('checkinEditChanged', () => {
  test('is false for an untouched check-in, seconds and tag order included', () => {
    const stored = entry({ entry_timestamp: '2026-10-19T14:30:59.999Z' });
    expect(
      checkinEditChanged(
        stored,
        { ...draftFromEntry(stored, TZ), tags: ['tired', 'calm'] },
        DAY,
        TZ
      )
    ).toBe(false);
  });

  test('is true once any field or the time changes', () => {
    const stored = entry();
    const untouched = draftFromEntry(stored, TZ);
    expect(
      checkinEditChanged(stored, { ...untouched, focus: 2 }, DAY, TZ)
    ).toBe(true);
    expect(
      checkinEditChanged(stored, { ...untouched, time: '09:31' }, DAY, TZ)
    ).toBe(true);
  });
});
