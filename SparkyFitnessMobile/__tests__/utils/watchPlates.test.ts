import {
  buildWatchPlateConfig,
  watchEquipmentLabel,
} from '../../src/utils/watchPlates';

describe('watchEquipmentLabel', () => {
  it('capitalizes the first equipment name', () => {
    expect(watchEquipmentLabel(['barbell', 'bench'])).toBe('Barbell');
  });

  it('is undefined with no equipment', () => {
    expect(watchEquipmentLabel(null)).toBeUndefined();
    expect(watchEquipmentLabel([])).toBeUndefined();
    expect(watchEquipmentLabel([' '])).toBeUndefined();
  });
});

describe('buildWatchPlateConfig', () => {
  it('is undefined for an exercise that is not loaded on a bar', () => {
    expect(buildWatchPlateConfig(['dumbbell'], null, 'kg')).toBeUndefined();
    expect(buildWatchPlateConfig(null, null, 'kg')).toBeUndefined();
  });

  it('uses the standard kg set and a 20 kg bar when nothing is saved', () => {
    const config = buildWatchPlateConfig(['barbell'], null, 'kg');
    expect(config).toMatchObject({
      unit: 'kg',
      barWeight: 20,
      collarWeight: 0,
    });
    expect(config?.plates[0]).toEqual({ weight: 25, pairs: 2 });
  });

  it('uses the saved inventory, its EZ bar for an EZ bar exercise and its collars', () => {
    const config = buildWatchPlateConfig(
      ['EZ curl bar'],
      {
        weight_unit: 'lbs',
        bars: [
          { id: 'a', name: null, kind: 'barbell', weight: 45 },
          { id: 'b', name: null, kind: 'ez', weight: 20 },
        ],
        plates: [
          { weight: 5, pairs: 1 },
          { weight: 45, pairs: 3 },
        ],
        collars_enabled: true,
        collar_weight: 2.5,
      },
      'kg'
    );
    expect(config).toEqual({
      unit: 'lbs',
      barWeight: 20,
      collarWeight: 2.5,
      plates: [
        { weight: 45, pairs: 3 },
        { weight: 5, pairs: 1 },
      ],
    });
  });
});
