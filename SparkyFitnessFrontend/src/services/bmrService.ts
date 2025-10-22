export enum BmrAlgorithm {
  MIFFLIN_ST_JEOR = 'Mifflin-St Jeor',
  REVISED_HARRIS_BENEDICT = 'Revised Harris-Benedict',
  KATCH_MCARDLE = 'Katch-McArdle',
  CUNNINGHAM = 'Cunningham',
  OXFORD = 'Oxford',
}

export const calculateBmr = (
  algorithm: BmrAlgorithm,
  weight: number, // in kg
  height: number, // in cm
  age: number, // in years
  gender: 'male' | 'female',
  bodyFatPercentage?: number
): number => {
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
        if (gender === 'male') {
          return 14.2 * weight + 593;
        } else {
          return 10.9 * weight + 677;
        }

    default:
      throw new Error('Unknown BMR algorithm');
  }
};