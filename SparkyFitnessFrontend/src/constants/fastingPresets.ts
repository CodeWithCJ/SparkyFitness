import i18n from 'i18next';
export const FASTING_PRESETS = [
  {
    id: '16-8',
    name: '16:8 Leangains',
    fastingHours: 16,
    eatingHours: 8,
    get description() {
      return i18n.t(
        'fastingPresets.skipBreakfastAndEatDuring',
        'Skip breakfast and eat during an 8-hour window.'
      );
    },
  },
  {
    id: '18-6',
    name: '18:6 Warrior',
    fastingHours: 18,
    eatingHours: 6,
    get description() {
      return i18n.t(
        'fastingPresets.moreAggressiveFastWithA',
        'More aggressive fast with a 6-hour eating window.'
      );
    },
  },
  {
    id: '20-4',
    name: '20:4 Warrior',
    fastingHours: 20,
    eatingHours: 4,
    get description() {
      return i18n.t(
        'fastingPresets.eatOneLargeMealOr',
        'Eat one large meal or spread calories over 4 hours.'
      );
    },
  },
  {
    id: 'circumadian',
    name: 'Circadian Rhythm',
    fastingHours: 13,
    eatingHours: 11,
    get description() {
      return i18n.t(
        'fastingPresets.fastFromSunsetToMorning',
        'Fast from sunset to morning.'
      );
    },
  },
  {
    id: 'custom',
    name: 'Custom Fast',
    fastingHours: 12,
    eatingHours: 12,
    get description() {
      return i18n.t(
        'fastingPresets.setYourOwnFastingDuration',
        'Set your own fasting duration.'
      );
    }, // Placeholder for custom logic
  },
];
