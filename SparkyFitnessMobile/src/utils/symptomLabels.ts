import type { TFunction } from 'i18next';

/**
 * Display labels for the built-in symptom chips (locations, qualities, triggers,
 * relief, phases and default symptoms). The English label is what is stored on
 * entries, so this only translates what is shown; custom user options that are
 * not in the map render as typed.
 */
export function getBuiltInSymptomLabels(t: TFunction): Record<string, string> {
  return {
    Head: t('symptoms.builtIn.head', { defaultValue: 'Head' }),
    Neck: t('symptoms.builtIn.neck', { defaultValue: 'Neck' }),
    Shoulders: t('symptoms.builtIn.shoulders', { defaultValue: 'Shoulders' }),
    'Upper back': t('symptoms.builtIn.upperBack', {
      defaultValue: 'Upper back',
    }),
    'Lower back': t('symptoms.builtIn.lowerBack', {
      defaultValue: 'Lower back',
    }),
    Chest: t('symptoms.builtIn.chest', { defaultValue: 'Chest' }),
    Abdomen: t('symptoms.builtIn.abdomen', { defaultValue: 'Abdomen' }),
    Pelvis: t('symptoms.builtIn.pelvis', { defaultValue: 'Pelvis' }),
    Hips: t('symptoms.builtIn.hips', { defaultValue: 'Hips' }),
    Arms: t('symptoms.builtIn.arms', { defaultValue: 'Arms' }),
    'Hands / wrists': t('symptoms.builtIn.handsWrists', {
      defaultValue: 'Hands / wrists',
    }),
    Legs: t('symptoms.builtIn.legs', { defaultValue: 'Legs' }),
    Knees: t('symptoms.builtIn.knees', { defaultValue: 'Knees' }),
    'Feet / ankles': t('symptoms.builtIn.feetAnkles', {
      defaultValue: 'Feet / ankles',
    }),
    'Whole body': t('symptoms.builtIn.wholeBody', {
      defaultValue: 'Whole body',
    }),
    Forehead: t('symptoms.builtIn.forehead', { defaultValue: 'Forehead' }),
    'Behind both eyes': t('symptoms.builtIn.behindBothEyes', {
      defaultValue: 'Behind both eyes',
    }),
    'Behind left eye': t('symptoms.builtIn.behindLeftEye', {
      defaultValue: 'Behind left eye',
    }),
    'Behind right eye': t('symptoms.builtIn.behindRightEye', {
      defaultValue: 'Behind right eye',
    }),
    'Left temple': t('symptoms.builtIn.leftTemple', {
      defaultValue: 'Left temple',
    }),
    'Right temple': t('symptoms.builtIn.rightTemple', {
      defaultValue: 'Right temple',
    }),
    'Top of head': t('symptoms.builtIn.topOfHead', {
      defaultValue: 'Top of head',
    }),
    'Back of head': t('symptoms.builtIn.backOfHead', {
      defaultValue: 'Back of head',
    }),
    Jaw: t('symptoms.builtIn.jaw', { defaultValue: 'Jaw' }),
    Sinuses: t('symptoms.builtIn.sinuses', { defaultValue: 'Sinuses' }),
    Face: t('symptoms.builtIn.face', { defaultValue: 'Face' }),
    'Whole head': t('symptoms.builtIn.wholeHead', {
      defaultValue: 'Whole head',
    }),
    Throbbing: t('symptoms.builtIn.throbbing', { defaultValue: 'Throbbing' }),
    Pulsing: t('symptoms.builtIn.pulsing', { defaultValue: 'Pulsing' }),
    Sharp: t('symptoms.builtIn.sharp', { defaultValue: 'Sharp' }),
    'Dull / ache': t('symptoms.builtIn.dullAche', {
      defaultValue: 'Dull / ache',
    }),
    Burning: t('symptoms.builtIn.burning', { defaultValue: 'Burning' }),
    Stiffness: t('symptoms.builtIn.stiffness', { defaultValue: 'Stiffness' }),
    Shooting: t('symptoms.builtIn.shooting', { defaultValue: 'Shooting' }),
    Stabbing: t('symptoms.builtIn.stabbing', { defaultValue: 'Stabbing' }),
    Pressure: t('symptoms.builtIn.pressure', { defaultValue: 'Pressure' }),
    Cramping: t('symptoms.builtIn.cramping', { defaultValue: 'Cramping' }),
    Itchy: t('symptoms.builtIn.itchy', { defaultValue: 'Itchy' }),
    Aura: t('symptoms.builtIn.aura', { defaultValue: 'Aura' }),
    Nausea: t('symptoms.builtIn.nausea', { defaultValue: 'Nausea' }),
    Vomiting: t('symptoms.builtIn.vomiting', { defaultValue: 'Vomiting' }),
    'Neck pain': t('symptoms.builtIn.neckPain', { defaultValue: 'Neck pain' }),
    'Stuffy nose': t('symptoms.builtIn.stuffyNose', {
      defaultValue: 'Stuffy nose',
    }),
    Dizziness: t('symptoms.builtIn.dizziness', { defaultValue: 'Dizziness' }),
    'Light sensitivity': t('symptoms.builtIn.lightSensitivity', {
      defaultValue: 'Light sensitivity',
    }),
    'Sound sensitivity': t('symptoms.builtIn.soundSensitivity', {
      defaultValue: 'Sound sensitivity',
    }),
    'Touch sensitivity': t('symptoms.builtIn.touchSensitivity', {
      defaultValue: 'Touch sensitivity',
    }),
    'Smell sensitivity': t('symptoms.builtIn.smellSensitivity', {
      defaultValue: 'Smell sensitivity',
    }),
    Fatigue: t('symptoms.builtIn.fatigue', { defaultValue: 'Fatigue' }),
    Irritability: t('symptoms.builtIn.irritability', {
      defaultValue: 'Irritability',
    }),
    Confusion: t('symptoms.builtIn.confusion', { defaultValue: 'Confusion' }),
    Sweating: t('symptoms.builtIn.sweating', { defaultValue: 'Sweating' }),
    'Body temperature change': t('symptoms.builtIn.bodyTemperatureChange', {
      defaultValue: 'Body temperature change',
    }),
    'Stomach ache': t('symptoms.builtIn.stomachAche', {
      defaultValue: 'Stomach ache',
    }),
    'Vision problems': t('symptoms.builtIn.visionProblems', {
      defaultValue: 'Vision problems',
    }),
    'Numbness / tingling': t('symptoms.builtIn.numbnessTingling', {
      defaultValue: 'Numbness / tingling',
    }),
    'Difficulty speaking': t('symptoms.builtIn.difficultySpeaking', {
      defaultValue: 'Difficulty speaking',
    }),
    'Ringing in ears': t('symptoms.builtIn.ringingInEars', {
      defaultValue: 'Ringing in ears',
    }),
    'Poor sleep': t('symptoms.builtIn.poorSleep', {
      defaultValue: 'Poor sleep',
    }),
    'Too much sleep': t('symptoms.builtIn.tooMuchSleep', {
      defaultValue: 'Too much sleep',
    }),
    'Irregular sleep schedule': t('symptoms.builtIn.irregularSleepSchedule', {
      defaultValue: 'Irregular sleep schedule',
    }),
    'Skipped meal': t('symptoms.builtIn.skippedMeal', {
      defaultValue: 'Skipped meal',
    }),
    Dehydration: t('symptoms.builtIn.dehydration', {
      defaultValue: 'Dehydration',
    }),
    Caffeine: t('symptoms.builtIn.caffeine', { defaultValue: 'Caffeine' }),
    Alcohol: t('symptoms.builtIn.alcohol', { defaultValue: 'Alcohol' }),
    'Red wine': t('symptoms.builtIn.redWine', { defaultValue: 'Red wine' }),
    Chocolate: t('symptoms.builtIn.chocolate', { defaultValue: 'Chocolate' }),
    'Aged cheese': t('symptoms.builtIn.agedCheese', {
      defaultValue: 'Aged cheese',
    }),
    'Cured meats': t('symptoms.builtIn.curedMeats', {
      defaultValue: 'Cured meats',
    }),
    MSG: t('symptoms.builtIn.mSG', { defaultValue: 'MSG' }),
    'Artificial sweeteners': t('symptoms.builtIn.artificialSweeteners', {
      defaultValue: 'Artificial sweeteners',
    }),
    'Histamine-rich food': t('symptoms.builtIn.histamineRichFood', {
      defaultValue: 'Histamine-rich food',
    }),
    Stress: t('symptoms.builtIn.stress', { defaultValue: 'Stress' }),
    Overexertion: t('symptoms.builtIn.overexertion', {
      defaultValue: 'Overexertion',
    }),
    'Screen time': t('symptoms.builtIn.screenTime', {
      defaultValue: 'Screen time',
    }),
    Travel: t('symptoms.builtIn.travel', { defaultValue: 'Travel' }),
    'Weather change': t('symptoms.builtIn.weatherChange', {
      defaultValue: 'Weather change',
    }),
    'Bright light': t('symptoms.builtIn.brightLight', {
      defaultValue: 'Bright light',
    }),
    'Loud noise': t('symptoms.builtIn.loudNoise', {
      defaultValue: 'Loud noise',
    }),
    'Strong smell': t('symptoms.builtIn.strongSmell', {
      defaultValue: 'Strong smell',
    }),
    Pollen: t('symptoms.builtIn.pollen', { defaultValue: 'Pollen' }),
    Dust: t('symptoms.builtIn.dust', { defaultValue: 'Dust' }),
    Menstruation: t('symptoms.builtIn.menstruation', {
      defaultValue: 'Menstruation',
    }),
    'Hormonal change': t('symptoms.builtIn.hormonalChange', {
      defaultValue: 'Hormonal change',
    }),
    'Medication overuse': t('symptoms.builtIn.medicationOveruse', {
      defaultValue: 'Medication overuse',
    }),
    Illness: t('symptoms.builtIn.illness', { defaultValue: 'Illness' }),
    Rest: t('symptoms.builtIn.rest', { defaultValue: 'Rest' }),
    'Dark, quiet room': t('symptoms.builtIn.darkQuietRoom', {
      defaultValue: 'Dark, quiet room',
    }),
    'Cold compress': t('symptoms.builtIn.coldCompress', {
      defaultValue: 'Cold compress',
    }),
    'Warm compress': t('symptoms.builtIn.warmCompress', {
      defaultValue: 'Warm compress',
    }),
    'Heat pack': t('symptoms.builtIn.heatPack', { defaultValue: 'Heat pack' }),
    'Scalp massage': t('symptoms.builtIn.scalpMassage', {
      defaultValue: 'Scalp massage',
    }),
    'Temple pressure': t('symptoms.builtIn.templePressure', {
      defaultValue: 'Temple pressure',
    }),
    Stretching: t('symptoms.builtIn.stretching', {
      defaultValue: 'Stretching',
    }),
    Meditation: t('symptoms.builtIn.meditation', {
      defaultValue: 'Meditation',
    }),
    Hydration: t('symptoms.builtIn.hydration', { defaultValue: 'Hydration' }),
    Sleep: t('symptoms.builtIn.sleep', { defaultValue: 'Sleep' }),
    'Mood change': t('symptoms.builtIn.moodChange', {
      defaultValue: 'Mood change',
    }),
    'Poor concentration': t('symptoms.builtIn.poorConcentration', {
      defaultValue: 'Poor concentration',
    }),
    Yawning: t('symptoms.builtIn.yawning', { defaultValue: 'Yawning' }),
    'Food cravings': t('symptoms.builtIn.foodCravings', {
      defaultValue: 'Food cravings',
    }),
    'Neck stiffness': t('symptoms.builtIn.neckStiffness', {
      defaultValue: 'Neck stiffness',
    }),
    'Frequent urination': t('symptoms.builtIn.frequentUrination', {
      defaultValue: 'Frequent urination',
    }),
    Visual: t('symptoms.builtIn.visual', { defaultValue: 'Visual' }),
    Sensory: t('symptoms.builtIn.sensory', { defaultValue: 'Sensory' }),
    Motor: t('symptoms.builtIn.motor', { defaultValue: 'Motor' }),
    Speech: t('symptoms.builtIn.speech', { defaultValue: 'Speech' }),
    Drained: t('symptoms.builtIn.drained', { defaultValue: 'Drained' }),
    'Stiff neck': t('symptoms.builtIn.stiffNeck', {
      defaultValue: 'Stiff neck',
    }),
    'Food & drink': t('symptoms.builtIn.foodDrink', {
      defaultValue: 'Food & drink',
    }),
    Lifestyle: t('symptoms.builtIn.lifestyle', { defaultValue: 'Lifestyle' }),
    Environment: t('symptoms.builtIn.environment', {
      defaultValue: 'Environment',
    }),
    Hormonal: t('symptoms.builtIn.hormonal', { defaultValue: 'Hormonal' }),
    Other: t('symptoms.builtIn.other', { defaultValue: 'Other' }),
    Headache: t('symptoms.builtIn.headache', { defaultValue: 'Headache' }),
    Constipation: t('symptoms.builtIn.constipation', {
      defaultValue: 'Constipation',
    }),
    Diarrhea: t('symptoms.builtIn.diarrhea', { defaultValue: 'Diarrhea' }),
    'Acid Reflux / GERD': t('symptoms.builtIn.acidRefluxGERD', {
      defaultValue: 'Acid Reflux / GERD',
    }),
    'Stomach Pain / Cramping': t('symptoms.builtIn.stomachPainCramping', {
      defaultValue: 'Stomach Pain / Cramping',
    }),
    Migraine: t('symptoms.builtIn.migraine', { defaultValue: 'Migraine' }),
    'Back pain': t('symptoms.builtIn.backPain', { defaultValue: 'Back pain' }),
    'Joint pain': t('symptoms.builtIn.jointPain', {
      defaultValue: 'Joint pain',
    }),
    'Muscle pain': t('symptoms.builtIn.musclePain', {
      defaultValue: 'Muscle pain',
    }),
    Bloating: t('symptoms.builtIn.bloating', { defaultValue: 'Bloating' }),
    Anxiety: t('symptoms.builtIn.anxiety', { defaultValue: 'Anxiety' }),
    'Panic attack': t('symptoms.builtIn.panicAttack', {
      defaultValue: 'Panic attack',
    }),
    'Brain fog': t('symptoms.builtIn.brainFog', { defaultValue: 'Brain fog' }),
    'Hay fever': t('symptoms.builtIn.hayFever', { defaultValue: 'Hay fever' }),
    Cough: t('symptoms.builtIn.cough', { defaultValue: 'Cough' }),
    Wheezing: t('symptoms.builtIn.wheezing', { defaultValue: 'Wheezing' }),
    'Sore throat': t('symptoms.builtIn.soreThroat', {
      defaultValue: 'Sore throat',
    }),
    Rash: t('symptoms.builtIn.rash', { defaultValue: 'Rash' }),
    'Eczema flare': t('symptoms.builtIn.eczemaFlare', {
      defaultValue: 'Eczema flare',
    }),
    Itching: t('symptoms.builtIn.itching', { defaultValue: 'Itching' }),
    Fever: t('symptoms.builtIn.fever', { defaultValue: 'Fever' }),
  };
}

export function translateBuiltInSymptomLabel(
  labels: Record<string, string>,
  label: string
): string {
  return Object.prototype.hasOwnProperty.call(labels, label)
    ? labels[label]
    : label;
}
