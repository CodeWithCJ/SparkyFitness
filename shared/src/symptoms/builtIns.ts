import { BUILT_IN_SYMPTOMS } from '../medications/symptoms.ts';
import type {
  SymptomDefinitionCategory,
  SymptomCustomFieldDef,
  SymptomOptionKind,
  SymptomPhase,
  SymptomScaleType,
  SymptomTemplate,
} from './constants.ts';

/** A symptom offered out of the box; picking one creates a user definition. */
export interface BuiltInSymptomDefinition {
  name: string;
  displayName: string;
  template: SymptomTemplate;
  category: SymptomDefinitionCategory;
  scaleType: SymptomScaleType;
  isEpisodic: boolean;
  isGlp1: boolean;
  customFieldDefs?: SymptomCustomFieldDef[];
}

// The original medication side-effect symptoms keep their names (and GLP-1
// flags) from `BUILT_IN_SYMPTOMS`; this only adds the template they use.
const LEGACY_TEMPLATES: Record<
  string,
  {
    template: SymptomTemplate;
    category: SymptomDefinitionCategory;
    isEpisodic?: boolean;
  }
> = {
  nausea: { template: 'gi', category: 'gi' },
  fatigue: { template: 'generic', category: 'general' },
  headache: { template: 'headache', category: 'head', isEpisodic: true },
  constipation: { template: 'gi', category: 'gi' },
  diarrhea: { template: 'gi', category: 'gi' },
  vomiting: { template: 'gi', category: 'gi' },
  acid_reflux: { template: 'gi', category: 'gi' },
  stomach_pain: { template: 'gi', category: 'gi' },
  dizziness: { template: 'generic', category: 'general' },
};

const legacyDefinitions: BuiltInSymptomDefinition[] = BUILT_IN_SYMPTOMS.map(
  (s) => {
    const meta = LEGACY_TEMPLATES[s.name] ?? {
      template: 'generic' as const,
      category: 'general' as const,
    };
    return {
      name: s.name,
      displayName: s.displayName,
      template: meta.template,
      category: meta.category,
      scaleType: '1-10' as const,
      isEpisodic: meta.isEpisodic ?? false,
      isGlp1: s.isGlp1,
    };
  }
);

const def = (
  name: string,
  displayName: string,
  template: SymptomTemplate,
  category: SymptomDefinitionCategory,
  isEpisodic = false,
  customFieldDefs?: SymptomCustomFieldDef[]
): BuiltInSymptomDefinition => ({
  name,
  displayName,
  template,
  category,
  scaleType: '1-10',
  isEpisodic,
  isGlp1: false,
  ...(customFieldDefs ? { customFieldDefs } : {}),
});

const additionalDefinitions: BuiltInSymptomDefinition[] = [
  def('migraine', 'Migraine', 'headache', 'head', true, [
    {
      key: 'migraine_type',
      label: 'Migraine type',
      type: 'select',
      options: ['Without aura', 'With aura', 'Menstrual', 'Chronic', 'Other'],
    },
  ]),
  def('back_pain', 'Back pain', 'pain', 'pain'),
  def('neck_pain', 'Neck pain', 'pain', 'pain'),
  def('joint_pain', 'Joint pain', 'pain', 'pain'),
  def('muscle_pain', 'Muscle pain', 'pain', 'pain'),
  def('bloating', 'Bloating', 'gi', 'gi'),
  def('anxiety', 'Anxiety', 'mental', 'mental'),
  def('panic_attack', 'Panic attack', 'mental', 'mental', true),
  def('brain_fog', 'Brain fog', 'generic', 'general'),
  def('hay_fever', 'Hay fever', 'respiratory', 'respiratory'),
  def('cough', 'Cough', 'respiratory', 'respiratory'),
  def('wheezing', 'Wheezing', 'respiratory', 'respiratory', true),
  def('sore_throat', 'Sore throat', 'respiratory', 'respiratory'),
  def('rash', 'Rash', 'skin', 'skin'),
  def('eczema_flare', 'Eczema flare', 'skin', 'skin', true),
  def('itching', 'Itching', 'skin', 'skin'),
  def('fever', 'Fever', 'generic', 'general', false, [
    { key: 'temperature', label: 'Temperature', type: 'number', unit: '°C' },
  ]),
];

export const BUILT_IN_SYMPTOM_DEFINITIONS: BuiltInSymptomDefinition[] = [
  ...legacyDefinitions,
  ...additionalDefinitions.filter(
    (d) => !legacyDefinitions.some((l) => l.name === d.name)
  ),
];

/** Symptoms suggested on first run ("What do you want to track?"). */
export const STARTER_SYMPTOM_NAMES = [
  'headache',
  'migraine',
  'back_pain',
  'joint_pain',
  'nausea',
  'fatigue',
  'anxiety',
  'hay_fever',
];

export interface BuiltInOptionGroup {
  group: string;
  items: string[];
}

/** Labels stored as-is in `symptom_entries` arrays; UIs may translate for display. */
export const BUILT_IN_TRIGGER_GROUPS: BuiltInOptionGroup[] = [
  {
    group: 'Sleep',
    items: ['Poor sleep', 'Too much sleep', 'Irregular sleep schedule'],
  },
  {
    group: 'Food & drink',
    items: [
      'Skipped meal',
      'Dehydration',
      'Caffeine',
      'Alcohol',
      'Red wine',
      'Chocolate',
      'Aged cheese',
      'Cured meats',
      'MSG',
      'Artificial sweeteners',
      'Histamine-rich food',
    ],
  },
  {
    group: 'Lifestyle',
    items: ['Stress', 'Overexertion', 'Screen time', 'Travel'],
  },
  {
    group: 'Environment',
    items: [
      'Weather change',
      'Bright light',
      'Loud noise',
      'Strong smell',
      'Pollen',
      'Dust',
    ],
  },
  {
    group: 'Hormonal',
    items: ['Menstruation', 'Hormonal change'],
  },
  {
    group: 'Other',
    items: ['Medication overuse', 'Illness'],
  },
];

export const BUILT_IN_OPTIONS: Record<SymptomOptionKind, string[]> = {
  location: [
    'Head',
    'Neck',
    'Shoulders',
    'Upper back',
    'Lower back',
    'Chest',
    'Abdomen',
    'Pelvis',
    'Hips',
    'Arms',
    'Hands / wrists',
    'Legs',
    'Knees',
    'Feet / ankles',
    'Whole body',
  ],
  head_location: [
    'Forehead',
    'Behind both eyes',
    'Behind left eye',
    'Behind right eye',
    'Left temple',
    'Right temple',
    'Top of head',
    'Back of head',
    'Neck',
    'Jaw',
    'Sinuses',
    'Face',
    'Whole head',
  ],
  quality: [
    'Throbbing',
    'Pulsing',
    'Sharp',
    'Dull / ache',
    'Burning',
    'Stiffness',
    'Shooting',
    'Stabbing',
    'Pressure',
    'Cramping',
    'Itchy',
  ],
  associated: [
    'Aura',
    'Nausea',
    'Vomiting',
    'Neck pain',
    'Stuffy nose',
    'Dizziness',
    'Light sensitivity',
    'Sound sensitivity',
    'Touch sensitivity',
    'Smell sensitivity',
    'Fatigue',
    'Irritability',
    'Confusion',
    'Sweating',
    'Body temperature change',
    'Stomach ache',
    'Vision problems',
    'Numbness / tingling',
    'Difficulty speaking',
    'Ringing in ears',
  ],
  trigger: BUILT_IN_TRIGGER_GROUPS.flatMap((g) => g.items),
  relief: [
    'Rest',
    'Dark, quiet room',
    'Cold compress',
    'Warm compress',
    'Heat pack',
    'Scalp massage',
    'Temple pressure',
    'Stretching',
    'Meditation',
    'Hydration',
    'Caffeine',
    'Sleep',
  ],
};

/** Optional per-phase chips for the headache template. */
export const BUILT_IN_PHASE_OPTIONS: Record<SymptomPhase, string[]> = {
  prodrome: [
    'Mood change',
    'Poor concentration',
    'Yawning',
    'Food cravings',
    'Neck stiffness',
    'Frequent urination',
    'Fatigue',
  ],
  aura: ['Visual', 'Sensory', 'Motor', 'Speech'],
  postdrome: ['Drained', 'Fatigue', 'Confusion', 'Stiff neck', 'Dizziness'],
};
