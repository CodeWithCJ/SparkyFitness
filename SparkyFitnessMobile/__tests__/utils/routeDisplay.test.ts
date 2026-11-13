import {
  formatRouteClimb,
  formatRouteDistance,
} from '../../src/utils/routeDisplay';

describe('routeDisplay', () => {
  it('formats distance in the chosen unit', () => {
    expect(formatRouteDistance(5000, 'km')).toBe('5.00 km');
    expect(formatRouteDistance(12400, 'km')).toBe('12.4 km');
    expect(formatRouteDistance(1609.344, 'miles')).toBe('1.00 mi');
  });

  it('formats climb in metres or feet', () => {
    expect(formatRouteClimb(120, 'km')).toBe('120 m');
    expect(formatRouteClimb(100, 'miles')).toBe('328 ft');
  });
});
