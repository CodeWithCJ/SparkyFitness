import i18n from 'i18next';
export interface DietTemplate {
  id: string;
  name: string;
  description: string;
  carbsPercentage: number;
  proteinPercentage: number;
  fatPercentage: number;
}

export const DIET_TEMPLATES: DietTemplate[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    get description() {
      return i18n.t(
        'dietTemplates.wellRoundedNutritionForGeneral',
        'Well-rounded nutrition for general health'
      );
    },
    carbsPercentage: 45,
    proteinPercentage: 20,
    fatPercentage: 35,
  },
  {
    id: 'mediterranean',
    name: 'Mediterranean',
    get description() {
      return i18n.t(
        'dietTemplates.heartHealthyWithHealthyFats',
        'Heart-healthy with healthy fats'
      );
    },
    carbsPercentage: 50,
    proteinPercentage: 15,
    fatPercentage: 35,
  },
  {
    id: 'dash',
    name: 'DASH',
    get description() {
      return i18n.t(
        'dietTemplates.dietaryApproachesToStopHypertension',
        'Dietary Approaches to Stop Hypertension'
      );
    },
    carbsPercentage: 55,
    proteinPercentage: 18,
    fatPercentage: 27,
  },
  {
    id: 'atkins',
    name: 'Atkins',
    get description() {
      return i18n.t(
        'dietTemplates.veryLowCarbHighFat',
        'Very low carb, high fat'
      );
    },
    carbsPercentage: 10,
    proteinPercentage: 30,
    fatPercentage: 60,
  },
  {
    id: 'low_fat',
    name: 'Low Fat',
    get description() {
      return i18n.t(
        'dietTemplates.highCarbMinimalFat',
        'High carb, minimal fat'
      );
    },
    carbsPercentage: 70,
    proteinPercentage: 20,
    fatPercentage: 10,
  },
  {
    id: 'low_carb',
    name: 'Low Carb / Keto',
    get description() {
      return i18n.t('dietTemplates.ketogenicStyleDiet', 'Ketogenic-style diet');
    },
    carbsPercentage: 5,
    proteinPercentage: 20,
    fatPercentage: 75,
  },
  {
    id: 'custom',
    name: 'Custom',
    get description() {
      return i18n.t(
        'dietTemplates.setYourOwnPercentages',
        'Set your own percentages'
      );
    },
    carbsPercentage: 40,
    proteinPercentage: 30,
    fatPercentage: 30,
  },
];

export const getDietTemplate = (id: string): DietTemplate | undefined => {
  return DIET_TEMPLATES.find((d) => d.id === id) || DIET_TEMPLATES[0];
};
