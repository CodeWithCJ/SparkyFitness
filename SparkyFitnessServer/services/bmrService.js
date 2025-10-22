const { log } = require('../config/logging');

const BmrAlgorithm = {
  MIFFLIN_ST_JEOR: 'Mifflin-St Jeor',
  REVISED_HARRIS_BENEDICT: 'Revised Harris-Benedict',
  KATCH_MCARDLE: 'Katch-McArdle',
  CUNNINGHAM: 'Cunningham',
  OXFORD: 'Oxford',
};

/**
 * Calculates Basal Metabolic Rate (BMR) using various algorithms.
 * @param {string} algorithm - The algorithm to use.
 * @param {number} weight - in kg
 * @param {number} height - in cm
 * @param {number} age - in years
 * @param {string} gender - 'male' or 'female'
 * @param {number} [bodyFatPercentage] - Body fat percentage
 * @returns {number} - Calculated BMR
 */
function calculateBmr(algorithm, weight, height, age, gender, bodyFatPercentage) {
  log('info', `Calculating BMR with ${algorithm} algorithm.`);

  switch (algorithm) {
    case BmrAlgorithm.MIFFLIN_ST_JEOR:
      if (!weight || !height || !age || !gender) throw new Error('Mifflin-St Jeor requires weight, height, age, and gender.');
      return 10 * weight + 6.25 * height - 5 * age + (gender === 'male' ? 5 : -161);

    case BmrAlgorithm.REVISED_HARRIS_BENEDICT:
      if (!weight || !height || !age || !gender) throw new Error('Revised Harris-Benedict requires weight, height, age, and gender.');
      if (gender === 'male') {
        return 13.397 * weight + 4.799 * height - 5.677 * age + 88.362;
      } else {
        return 9.247 * weight + 3.098 * height - 4.33 * age + 447.593;
      }

    case BmrAlgorithm.KATCH_MCARDLE:
      if (!weight || !bodyFatPercentage) throw new Error('Katch-McArdle requires weight and body fat percentage.');
      const lbmKatch = weight * (1 - bodyFatPercentage / 100);
      return 370 + 21.6 * lbmKatch;

    case BmrAlgorithm.CUNNINGHAM:
      if (!weight || !bodyFatPercentage) throw new Error('Cunningham requires weight and body fat percentage.');
      const lbmCunningham = weight * (1 - bodyFatPercentage / 100);
      return 500 + 22 * lbmCunningham;

    case BmrAlgorithm.OXFORD:
      if (!weight || !height || !age || !gender) throw new Error('Oxford requires weight, height, age, and gender.');
      // NOTE: The Oxford equation has many variations based on age/gender groups.
      // This implementation uses a simplified version for adults.
      // A more complex implementation could be added later if needed.
      if (gender === 'male') {
        return 14.2 * weight + 593; // Simplified for adult males
      } else {
        return 10.9 * weight + 677; // Simplified for adult females
      }

    default:
      log('error', `Unknown BMR algorithm: ${algorithm}`);
      throw new Error('Unknown BMR algorithm');
  }
}

module.exports = {
  BmrAlgorithm,
  calculateBmr,
};