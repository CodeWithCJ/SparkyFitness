import {
  filterEntriesBySubtype,
  filterMedsBySubtype,
} from '@/pages/Medications/medicationUtils';

type Row = { id: string; is_supplement?: boolean };

const meds: Row[] = [
  { id: 'metformin', is_supplement: false },
  { id: 'wegovy', is_supplement: false },
  { id: 'vitamin-d', is_supplement: true },
  { id: 'omega-3', is_supplement: true },
  { id: 'legacy' }, // is_supplement missing -> treated as a medication
];

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe('filterMedsBySubtype', () => {
  it('returns everything for "all"', () => {
    expect(ids(filterMedsBySubtype(meds, 'all'))).toEqual([
      'metformin',
      'wegovy',
      'vitamin-d',
      'omega-3',
      'legacy',
    ]);
  });

  it('returns only non-supplements for "meds" (missing flag counts as a med)', () => {
    expect(ids(filterMedsBySubtype(meds, 'meds'))).toEqual([
      'metformin',
      'wegovy',
      'legacy',
    ]);
  });

  it('returns only supplements for "supplements"', () => {
    expect(ids(filterMedsBySubtype(meds, 'supplements'))).toEqual([
      'vitamin-d',
      'omega-3',
    ]);
  });

  it('partitions completely: meds + supplements === all', () => {
    const all = filterMedsBySubtype(meds, 'all').length;
    const partitioned =
      filterMedsBySubtype(meds, 'meds').length +
      filterMedsBySubtype(meds, 'supplements').length;
    expect(partitioned).toBe(all);
  });

  it('does not mutate the input array', () => {
    const before = ids(meds);
    filterMedsBySubtype(meds, 'supplements');
    expect(ids(meds)).toEqual(before);
  });
});

describe('filterEntriesBySubtype', () => {
  type Entry = { id: string; medication_id: string };

  // 'ghost' is an entry whose medication row has been deleted, so its id is in no
  // visible-id set for any subtype.
  const entries: Entry[] = [
    { id: 'e1', medication_id: 'metformin' },
    { id: 'e2', medication_id: 'vitamin-d' },
    { id: 'e3', medication_id: 'ghost' },
  ];

  const entryIds = (rows: Entry[]) => rows.map((r) => r.id);
  const visibleIds = (subtype: 'meds' | 'supplements') =>
    new Set(filterMedsBySubtype(meds, subtype).map((m) => m.id));

  it('keeps orphaned entries in "all" even though their medication is gone', () => {
    const visible = new Set(filterMedsBySubtype(meds, 'all').map((m) => m.id));
    expect(entryIds(filterEntriesBySubtype(entries, visible, 'all'))).toEqual([
      'e1',
      'e2',
      'e3',
    ]);
  });

  it('drops supplement and orphan entries for "meds"', () => {
    expect(
      entryIds(filterEntriesBySubtype(entries, visibleIds('meds'), 'meds'))
    ).toEqual(['e1']);
  });

  it('drops medication and orphan entries for "supplements"', () => {
    expect(
      entryIds(
        filterEntriesBySubtype(
          entries,
          visibleIds('supplements'),
          'supplements'
        )
      )
    ).toEqual(['e2']);
  });

  it('does not mutate the input array', () => {
    const before = entryIds(entries);
    filterEntriesBySubtype(entries, visibleIds('meds'), 'meds');
    expect(entryIds(entries)).toEqual(before);
  });
});
