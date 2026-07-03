import {
  lbsToKg,
  kgToLbs,
  weightToKg,
  weightFromKg,
  kmToMiles,
  milesToKm,
  distanceToKm,
  distanceFromKm,
  cmToInches,
  inchesToCm,
  lengthToCm,
  lengthFromCm,
  cmToFeetInches,
  feetInchesToCm,
  kgToStonesLbs,
  stonesLbsToKg,
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

  describe('cmToInches', () => {
    it('converts 2.54 cm to 1 inch', () => {
      expect(cmToInches(2.54)).toBeCloseTo(1, 4);
    });

    it('converts 100 cm to ~39.37 inches', () => {
      expect(cmToInches(100)).toBeCloseTo(39.3701, 2);
    });

    it('returns 0 for 0', () => {
      expect(cmToInches(0)).toBe(0);
    });
  });

  describe('inchesToCm', () => {
    it('converts 1 inch to 2.54 cm', () => {
      expect(inchesToCm(1)).toBeCloseTo(2.54, 4);
    });

    it('converts 12 inches (1 ft) to 30.48 cm', () => {
      expect(inchesToCm(12)).toBeCloseTo(30.48, 2);
    });

    it('returns 0 for 0', () => {
      expect(inchesToCm(0)).toBe(0);
    });
  });

  describe('lengthToCm', () => {
    it('returns value unchanged when unit is cm', () => {
      expect(lengthToCm(180, 'cm')).toBe(180);
    });

    it('converts inches to cm when unit is inches', () => {
      expect(lengthToCm(36, 'inches')).toBeCloseTo(91.44, 2);
    });
  });

  describe('lengthFromCm', () => {
    it('returns value unchanged when unit is cm', () => {
      expect(lengthFromCm(180, 'cm')).toBe(180);
    });

    it('converts cm to inches when unit is inches', () => {
      expect(lengthFromCm(91.44, 'inches')).toBeCloseTo(36, 2);
    });
  });

  describe('round-trip length conversions', () => {
    it.each([0, 1, 50, 100, 180, 250])('cm → cm preserves %d cm', (cm) => {
      expect(lengthFromCm(lengthToCm(cm, 'cm'), 'cm')).toBeCloseTo(cm, 4);
    });

    it.each([0, 1, 30, 70, 90, 120])('inches → cm → inches preserves %d in', (inches) => {
      expect(lengthFromCm(lengthToCm(inches, 'inches'), 'inches')).toBeCloseTo(inches, 4);
    });
  });

  describe('cmToFeetInches', () => {
    it('splits exact 5 ft into 5/0', () => {
      const { feet, inches } = cmToFeetInches(152.4);
      expect(feet).toBe(5);
      expect(inches).toBeCloseTo(0, 4);
    });

    it("splits 6'1\" (185.42 cm) into 6/1", () => {
      const { feet, inches } = cmToFeetInches(185.42);
      expect(feet).toBe(6);
      expect(inches).toBeCloseTo(1, 4);
    });

    it('returns 0/0 for 0 cm', () => {
      const { feet, inches } = cmToFeetInches(0);
      expect(feet).toBe(0);
      expect(inches).toBe(0);
    });
  });

  describe('feetInchesToCm', () => {
    it("combines 5'0\" → 152.4 cm", () => {
      expect(feetInchesToCm(5, 0)).toBeCloseTo(152.4, 4);
    });

    it("combines 6'1\" → 185.42 cm", () => {
      expect(feetInchesToCm(6, 1)).toBeCloseTo(185.42, 4);
    });

    it('combines 0/0 → 0 cm', () => {
      expect(feetInchesToCm(0, 0)).toBe(0);
    });
  });

  describe('round-trip ft_in conversions', () => {
    it.each([
      [5, 0],
      [5, 7],
      [6, 1.5],
      [4, 11],
      [0, 8],
    ])('cm → ft/in → cm preserves %d ft %d in', (feet, inches) => {
      const cm = feetInchesToCm(feet, inches);
      const split = cmToFeetInches(cm);
      expect(feetInchesToCm(split.feet, split.inches)).toBeCloseTo(cm, 4);
    });
  });

  describe('kgToStonesLbs', () => {
    it('splits exact 1 stone (6.35029 kg) into 1/0', () => {
      const { stones, lbs } = kgToStonesLbs(6.35029318);
      expect(stones).toBe(1);
      expect(lbs).toBeCloseTo(0, 3);
    });

    it('splits 80 kg into 12/8.4 (~12st 8.4lb)', () => {
      const { stones, lbs } = kgToStonesLbs(80);
      expect(stones).toBe(12);
      expect(lbs).toBeCloseTo(8.4, 1);
    });

    it('returns 0/0 for 0 kg', () => {
      const { stones, lbs } = kgToStonesLbs(0);
      expect(stones).toBe(0);
      expect(lbs).toBe(0);
    });
  });

  describe('stonesLbsToKg', () => {
    it('combines 1st 0lb → ~6.35029 kg', () => {
      expect(stonesLbsToKg(1, 0)).toBeCloseTo(6.35029, 4);
    });

    it('combines 12st 8lb → ~79.832 kg', () => {
      expect(stonesLbsToKg(12, 8)).toBeCloseTo(79.832, 2);
    });

    it('combines 0/0 → 0 kg', () => {
      expect(stonesLbsToKg(0, 0)).toBe(0);
    });
  });

  describe('round-trip st_lbs conversions', () => {
    it.each([
      [10, 0],
      [12, 8],
      [8, 13.5],
      [0, 7],
      [15, 4.25],
    ])('kg → st/lb → kg preserves %d st %d lb', (stones, lbs) => {
      const kg = stonesLbsToKg(stones, lbs);
      const split = kgToStonesLbs(kg);
      expect(stonesLbsToKg(split.stones, split.lbs)).toBeCloseTo(kg, 4);
    });
  });
});
