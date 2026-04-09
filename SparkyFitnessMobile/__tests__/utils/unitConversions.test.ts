import {
  lbsToKg,
  kgToLbs,
  weightToKg,
  weightFromKg,
  kmToMiles,
  milesToKm,
  distanceToKm,
  distanceFromKm,
} from '../../src/utils/unitConversions';

describe('unitConversions', () => {
  describe('lbsToKg', () => {
    it('converts 1 lb to ~0.4536 kg', () => {
      expect(lbsToKg(1)).toBeCloseTo(0.4536, 3);
    });

    it('converts 100 lbs to ~45.36 kg', () => {
      expect(lbsToKg(100)).toBeCloseTo(45.359, 2);
    });

    it('returns 0 for 0', () => {
      expect(lbsToKg(0)).toBe(0);
    });
  });

  describe('kgToLbs', () => {
    it('converts 1 kg to ~2.2046 lbs', () => {
      expect(kgToLbs(1)).toBeCloseTo(2.2046, 3);
    });

    it('converts 100 kg to ~220.46 lbs', () => {
      expect(kgToLbs(100)).toBeCloseTo(220.462, 1);
    });

    it('returns 0 for 0', () => {
      expect(kgToLbs(0)).toBe(0);
    });
  });

  describe('round-trip weight conversions', () => {
    it.each([0, 1, 50, 100, 225, 500])('kg → lbs → kg preserves %d kg', (kg) => {
      expect(lbsToKg(kgToLbs(kg))).toBeCloseTo(kg, 4);
    });

    it.each([0, 1, 45, 135, 315, 1000])('lbs → kg → lbs preserves %d lbs', (lbs) => {
      expect(kgToLbs(lbsToKg(lbs))).toBeCloseTo(lbs, 4);
    });
  });

  describe('weightToKg', () => {
    it('returns value unchanged when unit is kg', () => {
      expect(weightToKg(80, 'kg')).toBe(80);
    });

    it('converts lbs to kg when unit is lbs', () => {
      expect(weightToKg(100, 'lbs')).toBeCloseTo(45.359, 2);
    });
  });

  describe('weightFromKg', () => {
    it('returns value unchanged when unit is kg', () => {
      expect(weightFromKg(80, 'kg')).toBe(80);
    });

    it('converts kg to lbs when unit is lbs', () => {
      expect(weightFromKg(100, 'lbs')).toBeCloseTo(220.462, 1);
    });
  });

  describe('kmToMiles', () => {
    it('converts 1 km to ~0.6214 miles', () => {
      expect(kmToMiles(1)).toBeCloseTo(0.6214, 3);
    });

    it('converts 10 km to ~6.21 miles', () => {
      expect(kmToMiles(10)).toBeCloseTo(6.214, 2);
    });

    it('returns 0 for 0', () => {
      expect(kmToMiles(0)).toBe(0);
    });
  });

  describe('milesToKm', () => {
    it('converts 1 mile to ~1.609 km', () => {
      expect(milesToKm(1)).toBeCloseTo(1.6093, 3);
    });

    it('converts a marathon (26.2 miles) to ~42.16 km', () => {
      expect(milesToKm(26.2)).toBeCloseTo(42.165, 1);
    });

    it('returns 0 for 0', () => {
      expect(milesToKm(0)).toBe(0);
    });
  });

  describe('round-trip distance conversions', () => {
    it.each([0, 1, 5, 10, 42.195, 100])('km → miles → km preserves %d km', (km) => {
      expect(milesToKm(kmToMiles(km))).toBeCloseTo(km, 3);
    });

    it.each([0, 1, 3.1, 6.2, 13.1, 26.2])('miles → km → miles preserves %d miles', (miles) => {
      expect(kmToMiles(milesToKm(miles))).toBeCloseTo(miles, 3);
    });
  });

  describe('distanceToKm', () => {
    it('returns value unchanged when unit is km', () => {
      expect(distanceToKm(5, 'km')).toBe(5);
    });

    it('converts miles to km when unit is miles', () => {
      expect(distanceToKm(1, 'miles')).toBeCloseTo(1.6093, 3);
    });
  });

  describe('distanceFromKm', () => {
    it('returns value unchanged when unit is km', () => {
      expect(distanceFromKm(5, 'km')).toBe(5);
    });

    it('converts km to miles when unit is miles', () => {
      expect(distanceFromKm(10, 'miles')).toBeCloseTo(6.214, 2);
    });
  });
});
