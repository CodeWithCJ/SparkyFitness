// Mappings for wger integration

// Maps SparkyFitness muscle names to wger muscle names
const muscleNameMap = {
    'abdominals': ['Abs', 'Obliquus externus abdominis', 'Rectus abdominis'],
    'abductors': ['Abductors'],
    'adductors': ['Adductors'],
    'biceps': ['Biceps', 'Biceps brachii'],
    'calves': ['Calves', 'Soleus', 'Gastrocnemius'],
    'chest': ['Chest', 'Serratus anterior', 'Pectoralis major'],
    'forearms': ['Brachialis'],
    'glutes': ['Glutes', 'Gluteus maximus'],
    'hamstrings': ['Hamstrings', 'Biceps femoris'],
    'lats': ['Lats', 'Latissimus dorsi'],
    'lower back': ['Lower Back'],
    'middle back': ['Middle Back'],
    'neck': ['Neck'],
    'quadriceps': ['Quads', 'Quadriceps femoris'],
    'shoulders': ['Shoulders', 'Anterior deltoid'],
    'traps': ['Trapezius'],
    'triceps': ['Triceps', 'Triceps brachii'],
};

// Maps SparkyFitness equipment names to wger equipment names
const equipmentNameMap = {
    'barbell': 'Barbell',
    'bench': ['Bench', 'Incline bench'],
    'bodyweight': 'none (bodyweight exercise)',
    'dumbbell': 'Dumbbell',
    'exercise ball': 'Swiss Ball',
    'ez-bar': 'SZ-Bar',
    'kettlebell': 'Kettlebell',
    'machine': 'Machine',
    'pull-up bar': 'Pull-up bar',
    'bands': 'Resistance band',
    'other': ['Other', 'Gym mat'],
};

// Maps wger level names to SparkyFitness level names
const levelMap = {
  'Beginner': 'beginner',
  'Intermediate': 'intermediate',
  'Expert': 'expert',
};

const forceMap = {
  'static': 'static',
  'pull': 'pull',
  'push': 'push',
};

const mechanicMap = {
  'isolation': 'isolation',
  'compound': 'compound',
};

function createReverseMap(map) {
  const reverseMap = {};
  for (const key in map) {
    const values = Array.isArray(map[key]) ? map[key] : [map[key]];
    for (const value of values) {
      reverseMap[value.toLowerCase()] = key;
    }
  }
  return reverseMap;
}

module.exports = {
  muscleNameMap,
  equipmentNameMap,
  levelMap,
  forceMap,
  mechanicMap,
  createReverseMap,
};