import { QueryClient } from '@tanstack/react-query';
import type { TagAction } from '@workspace/shared';
import { changeWaterIntake } from '../../src/services/api/measurementsApi';
import {
  describeTagAction,
  refreshAfterTagAction,
  undoTagAction,
} from '../../src/services/tagActions';
import type { WaterContainer } from '../../src/types/measurements';

jest.mock('../../src/services/api/measurementsApi', () => ({
  changeWaterIntake: jest.fn(() => Promise.resolve({})),
}));

const action: TagAction = { type: 'water', container_id: 7, drinks: 2 };
const t = ((key: string, options: Record<string, unknown>) =>
  String(options.defaultValue)
    .replace('{{drinks}}', String(options.drinks))
    .replace('{{name}}', String(options.name))) as never;

describe('tag actions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('describes a water action with its container', () => {
    const containers = [{ id: 7, name: 'Stanley' }] as WaterContainer[];
    expect(describeTagAction(t, action, { waterContainers: containers })).toBe(
      '2 × Stanley'
    );
  });

  it('says so when the container was deleted', () => {
    expect(describeTagAction(t, action, { waterContainers: [] })).toBe(
      'Water container no longer exists'
    );
  });

  it('undoes a water action by removing the same drinks', async () => {
    await undoTagAction(action, '2026-10-30');
    expect(changeWaterIntake).toHaveBeenCalledWith({
      entryDate: '2026-10-30',
      changeDrinks: -2,
      containerId: 7,
    });
  });

  it('refreshes the water caches for that day', () => {
    const queryClient = new QueryClient();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    refreshAfterTagAction(queryClient, action, '2026-10-30');
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
