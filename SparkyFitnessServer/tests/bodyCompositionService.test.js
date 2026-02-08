const { calculateBodyFatNavy } = require('../services/bodyCompositionService');

describe('bodyCompositionService', () => {
    describe('calculateBodyFatNavy', () => {
        test('calculates correct body fat for males using Metric inputs (converted from bug report)', () => {
            // Bug report values in inches:
            // Abdomen (Waist): 32.87
            // Neck: 14.17
            // Height: 75.98
            // Formula: 86.010 * log10(32.87 - 14.17) - 70.041 * log10(75.98) + 36.76 = 14.425...

            const waistCm = 32.87 * 2.54;
            const neckCm = 14.17 * 2.54;
            const heightCm = 75.98 * 2.54;

            const result = calculateBodyFatNavy('male', heightCm, waistCm, neckCm);
            expect(result).toBe(14.43);
        });

        test('calculates correct body fat for females (standard values)', () => {
            // Example female values
            // Height: 160 cm (62.99 in)
            // Waist: 70 cm (27.56 in)
            // Neck: 32 cm (12.60 in)
            // Hips: 95 cm (37.40 in)

            // Formula: 163.205 * log10(27.56 + 37.40 - 12.60) - 97.684 * log10(62.99) - 78.387
            // 163.205 * log10(52.36) - 97.684 * log10(62.99) - 78.387
            // 163.205 * 1.71899 - 97.684 * 1.79927 - 78.387
            // 280.547 - 175.759 - 78.387 = 26.401...

            const heightCm = 160;
            const waistCm = 70;
            const neckCm = 32;
            const hipsCm = 95;

            const result = calculateBodyFatNavy('female', heightCm, waistCm, neckCm, hipsCm);
            expect(result).toBeCloseTo(26.40, 1);
        });

        test('throws error for missing measurements', () => {
            expect(() => calculateBodyFatNavy('male', 180, 80)).toThrow();
            expect(() => calculateBodyFatNavy('female', 160, 70, 32)).toThrow();
        });
    });
});
