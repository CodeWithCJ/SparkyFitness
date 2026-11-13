import type { ActivitySport } from '../utils/activitySport.js';

export interface CorosSportDefinition {
  name: string;
  category: 'cardio' | 'strength';
  sport: ActivitySport;
}

/**
 * Official COROS sportType codes mapped to display names, database categories, and canonical sports.
 */
export const COROS_SPORT_TYPES: Record<number, CorosSportDefinition> = {
  // Running
  100: { name: 'Outdoor Run', category: 'cardio', sport: 'running' },
  101: { name: 'Indoor Run', category: 'cardio', sport: 'running' },
  102: { name: 'Trail Run', category: 'cardio', sport: 'running' },
  103: { name: 'Track Run', category: 'cardio', sport: 'running' },

  // Hiking & Climbing
  104: { name: 'Hike', category: 'cardio', sport: 'hiking' },
  105: { name: 'Mountain Climb', category: 'cardio', sport: 'hiking' },
  106: { name: 'Multi-Pitch', category: 'cardio', sport: 'hiking' },

  // Cycling
  200: { name: 'Outdoor Bike', category: 'cardio', sport: 'cycling' },
  201: { name: 'Indoor Bike', category: 'cardio', sport: 'cycling' },
  202: { name: 'E-Bike', category: 'cardio', sport: 'cycling' },
  203: { name: 'Gravel', category: 'cardio', sport: 'cycling' },
  204: { name: 'MTB', category: 'cardio', sport: 'cycling' },
  205: { name: 'E-MTB', category: 'cardio', sport: 'cycling' },
  299: { name: 'Helmet Bike', category: 'cardio', sport: 'cycling' },

  // Swimming
  300: { name: 'Pool Swim', category: 'cardio', sport: 'swimming' },
  301: { name: 'Open Water', category: 'cardio', sport: 'swimming' },

  // Strength & Fitness
  400: { name: 'Gym Cardio', category: 'cardio', sport: 'fitness_equipment' },
  401: { name: 'GPS Cardio', category: 'cardio', sport: 'other' },
  402: { name: 'Strength', category: 'strength', sport: 'strength' },

  // Snow Sports
  500: { name: 'Ski', category: 'cardio', sport: 'other' },
  501: { name: 'Snowboard', category: 'cardio', sport: 'other' },
  502: { name: 'XC Ski', category: 'cardio', sport: 'other' },
  503: { name: 'Alpine Touring', category: 'cardio', sport: 'other' },

  // Martial Arts
  600: { name: 'Fighter', category: 'cardio', sport: 'other' },

  // Water Sports & Rowing
  700: { name: 'Rowing', category: 'cardio', sport: 'rowing' },
  701: { name: 'Indoor Row', category: 'cardio', sport: 'rowing' },
  702: { name: 'Whitewater', category: 'cardio', sport: 'rowing' },
  704: { name: 'Flatwater', category: 'cardio', sport: 'rowing' },
  705: { name: 'Windsurfing', category: 'cardio', sport: 'other' },
  706: { name: 'Speedsurfing', category: 'cardio', sport: 'other' },
  707: { name: 'Spearfishing', category: 'cardio', sport: 'other' },

  // Climbing
  800: { name: 'Indoor Climb', category: 'cardio', sport: 'other' },
  801: { name: 'Bouldering', category: 'cardio', sport: 'other' },
  802: { name: 'Outdoor Climb', category: 'cardio', sport: 'other' },

  // Walking & Other Cardio
  900: { name: 'Walk', category: 'cardio', sport: 'walking' },
  901: { name: 'Jump Rope', category: 'cardio', sport: 'other' },
  902: {
    name: 'Stair Climbing',
    category: 'cardio',
    sport: 'fitness_equipment',
  },
  903: { name: 'Elliptical', category: 'cardio', sport: 'fitness_equipment' },
  904: { name: 'Yoga', category: 'cardio', sport: 'other' },
  905: { name: 'Pilates', category: 'cardio', sport: 'other' },
  906: { name: 'Boxing', category: 'cardio', sport: 'other' },
  1000: { name: 'Badminton', category: 'cardio', sport: 'other' },
  1001: { name: 'Ping Pong', category: 'cardio', sport: 'other' },
};
