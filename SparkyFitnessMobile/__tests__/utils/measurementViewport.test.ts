import { measurementViewport } from '../../src/utils/measurementViewport';

test('inverts zoom around plot center and clamps panning to the account day', () => {
  expect(measurementViewport(1, 0, 32, 320, 1440)).toEqual({
    from: 0,
    to: 1440,
  });
  expect(measurementViewport(2, -176, 32, 320, 1440)).toEqual({
    from: 360,
    to: 1080,
  });
  expect(measurementViewport(1, 288, 32, 320, 1440)).toEqual({
    from: 0,
    to: 0,
  });
  expect(measurementViewport(1, -288, 32, 320, 1440)).toEqual({
    from: 1440,
    to: 1440,
  });
});

test('uses the actual day length on DST transitions and handles unmeasured plots', () => {
  expect(measurementViewport(2, -176, 32, 320, 1500)).toEqual({
    from: 375,
    to: 1125,
  });
  expect(measurementViewport(1, 0, 0, 0, 1380)).toEqual({ from: 0, to: 1380 });
});
