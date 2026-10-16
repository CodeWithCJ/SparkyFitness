import {
  distanceStandardLabel,
  groupPersonalRecords,
  recordsHeldBy,
} from '../../src/utils/personalRecords';

const t = ((key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key) as never;

const item = (
  sportGroup: 'run' | 'walk' | 'ride' | undefined,
  distanceStandard: '1k' | '5k' | 'custom',
  activityId = 'a'
) =>
  ({
    sportGroup,
    distanceStandard,
    label: 'Custom (7 km)',
    activityId,
  }) as never;

describe('groupPersonalRecords', () => {
  test('groups by sport in a fixed order and keeps the distances in order', () => {
    const groups = groupPersonalRecords([
      item('ride', '5k'),
      item('run', '1k'),
      item('walk', '1k'),
      item('run', '5k'),
    ]);
    expect(groups.map((g) => g.group)).toEqual(['run', 'walk', 'ride']);
    expect(groups[0].items.map((i) => i.distanceStandard)).toEqual([
      '1k',
      '5k',
    ]);
  });

  test('puts a record from an older server with no group under other', () => {
    expect(groupPersonalRecords([item(undefined, '5k')])[0].group).toBe(
      'other'
    );
  });

  test('is empty with no records', () => {
    expect(groupPersonalRecords([])).toEqual([]);
  });
});

test('recordsHeldBy returns only the records of that activity', () => {
  const list = [item('run', '5k', 'x'), item('run', '1k', 'y')];
  expect(recordsHeldBy(list, 'x')).toHaveLength(1);
  expect(recordsHeldBy(list, 'z')).toEqual([]);
});

test('distance labels are named, and a custom one keeps the server label', () => {
  expect(distanceStandardLabel(t, item('run', '5k'))).toBe('5 km');
  expect(distanceStandardLabel(t, item('run', 'custom'))).toBe('Custom (7 km)');
});
