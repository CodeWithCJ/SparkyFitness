import { describe, expect, it } from 'vitest';
import {
  trailShareFromEdges,
  valhallaCostingOptions,
} from '../services/routing/valhallaCosting.js';

const base = {
  surface: 'any' as const,
  hilliness: 'any' as const,
  avoidSteps: false,
  avoidBusyRoads: false,
};

describe('valhallaCostingOptions', () => {
  it('adds nothing for no style or an all-default style', () => {
    expect(valhallaCostingOptions('run', undefined)).toBeUndefined();
    expect(valhallaCostingOptions('ride', base)).toBeUndefined();
  });

  it('maps pedestrian preferences', () => {
    expect(
      valhallaCostingOptions('hike', {
        ...base,
        surface: 'trails',
        hilliness: 'hilly',
        avoidSteps: true,
      })
    ).toEqual({
      pedestrian: {
        walkway_factor: 0.5,
        sidewalk_factor: 2,
        use_tracks: 1,
        use_hills: 1,
        step_penalty: 600,
      },
    });
    expect(
      valhallaCostingOptions('walk', {
        ...base,
        surface: 'roads',
        hilliness: 'flat',
      })
    ).toEqual({
      pedestrian: { use_tracks: 0, sidewalk_factor: 0.7, use_hills: 0 },
    });
  });

  it('maps cycling preferences and ignores steps', () => {
    expect(
      valhallaCostingOptions('ride', {
        ...base,
        surface: 'trails',
        avoidSteps: true,
      })
    ).toEqual({ bicycle: { use_roads: 0.1, avoid_bad_surfaces: 0 } });
    expect(
      valhallaCostingOptions('ride', { ...base, avoidSteps: true })
    ).toBeUndefined();
  });

  it('lets avoiding busy roads win over a road preference when cycling', () => {
    expect(
      valhallaCostingOptions('ride', {
        ...base,
        surface: 'roads',
        avoidBusyRoads: true,
      })
    ).toEqual({
      bicycle: {
        use_roads: 0.25,
        avoid_bad_surfaces: 1,
        use_living_streets: 1,
      },
    });
  });

  it('keeps a stronger trail preference when avoiding busy roads on foot', () => {
    expect(
      valhallaCostingOptions('run', {
        ...base,
        surface: 'trails',
        avoidBusyRoads: true,
      })?.pedestrian.walkway_factor
    ).toBe(0.5);
    expect(
      valhallaCostingOptions('run', { ...base, avoidBusyRoads: true })
    ).toEqual({ pedestrian: { use_living_streets: 1, walkway_factor: 0.7 } });
  });
});

describe('trailShareFromEdges', () => {
  it('weights paths and unpaved surfaces by length', () => {
    expect(
      trailShareFromEdges([
        { length: 1, use: 'road', surface: 'paved_smooth' },
        { length: 1, use: 'path', surface: 'compacted' },
        { length: 2, use: 'footway', surface: 'gravel' },
      ])
    ).toBeCloseTo(0.75);
  });

  it('is null when no edge has a length', () => {
    expect(trailShareFromEdges([])).toBeNull();
    expect(trailShareFromEdges([{ use: 'path' }])).toBeNull();
  });
});
