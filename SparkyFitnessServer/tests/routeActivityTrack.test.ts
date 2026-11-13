import { describe, expect, it } from 'vitest';
import { toRoutePoint } from '../models/routeRepository.js';

describe('toRoutePoint', () => {
  it('keeps a valid point as it is', () => {
    expect(toRoutePoint({ lat: 40, lon: -74, alt: 12 })).toEqual({
      lat: 40,
      lon: -74,
      alt: 12,
    });
    expect(toRoutePoint({ lat: 40, lon: -74 })).toEqual({ lat: 40, lon: -74 });
  });

  it('drops only the altitude when it is out of range or not a number', () => {
    expect(toRoutePoint({ lat: 40, lon: -74, alt: -9999 })).toEqual({
      lat: 40,
      lon: -74,
    });
    expect(toRoutePoint({ lat: 40, lon: -74, alt: 99999 })).toEqual({
      lat: 40,
      lon: -74,
    });
    expect(toRoutePoint({ lat: 40, lon: -74, alt: 'high' })).toEqual({
      lat: 40,
      lon: -74,
    });
  });

  it('drops a point with no usable position', () => {
    expect(toRoutePoint({ lat: 95, lon: 0, alt: 3 })).toBeNull();
    expect(toRoutePoint({ lat: 'x', lon: 0 })).toBeNull();
    expect(toRoutePoint({ lon: 0 })).toBeNull();
    expect(toRoutePoint(null)).toBeNull();
    expect(toRoutePoint(7)).toBeNull();
  });
});
