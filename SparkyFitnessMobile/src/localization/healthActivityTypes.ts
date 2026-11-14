import type { TFunction } from 'i18next';
import type { HealthActivityType } from '@workspace/shared';

/**
 * Labels for the Health activity types (#1750) an exercise is written to Apple
 * Health or Health Connect as. One static key per type so the i18n audit can
 * check every one; a `Record` over the shared key union makes a new key without
 * a label a compile error.
 */
const HEALTH_ACTIVITY_TYPE_LABELS: Record<
  HealthActivityType,
  (t: TFunction) => string
> = {
  american_football: (t) =>
    t('healthActivityTypes.american_football', {
      defaultValue: 'American Football',
    }),
  archery: (t) => t('healthActivityTypes.archery', { defaultValue: 'Archery' }),
  australian_football: (t) =>
    t('healthActivityTypes.australian_football', {
      defaultValue: 'Australian Football',
    }),
  badminton: (t) =>
    t('healthActivityTypes.badminton', { defaultValue: 'Badminton' }),
  baseball: (t) =>
    t('healthActivityTypes.baseball', { defaultValue: 'Baseball' }),
  basketball: (t) =>
    t('healthActivityTypes.basketball', { defaultValue: 'Basketball' }),
  bowling: (t) => t('healthActivityTypes.bowling', { defaultValue: 'Bowling' }),
  boxing: (t) => t('healthActivityTypes.boxing', { defaultValue: 'Boxing' }),
  climbing: (t) =>
    t('healthActivityTypes.climbing', { defaultValue: 'Climbing' }),
  cricket: (t) => t('healthActivityTypes.cricket', { defaultValue: 'Cricket' }),
  cross_training: (t) =>
    t('healthActivityTypes.cross_training', { defaultValue: 'Cross Training' }),
  curling: (t) => t('healthActivityTypes.curling', { defaultValue: 'Curling' }),
  cycling: (t) => t('healthActivityTypes.cycling', { defaultValue: 'Cycling' }),
  cycling_indoor: (t) =>
    t('healthActivityTypes.cycling_indoor', { defaultValue: 'Indoor Cycling' }),
  elliptical: (t) =>
    t('healthActivityTypes.elliptical', { defaultValue: 'Elliptical' }),
  equestrian_sports: (t) =>
    t('healthActivityTypes.equestrian_sports', {
      defaultValue: 'Equestrian Sports',
    }),
  fencing: (t) => t('healthActivityTypes.fencing', { defaultValue: 'Fencing' }),
  fishing: (t) => t('healthActivityTypes.fishing', { defaultValue: 'Fishing' }),
  functional_strength_training: (t) =>
    t('healthActivityTypes.functional_strength_training', {
      defaultValue: 'Functional Strength Training',
    }),
  golf: (t) => t('healthActivityTypes.golf', { defaultValue: 'Golf' }),
  gymnastics: (t) =>
    t('healthActivityTypes.gymnastics', { defaultValue: 'Gymnastics' }),
  handball: (t) =>
    t('healthActivityTypes.handball', { defaultValue: 'Handball' }),
  hiking: (t) => t('healthActivityTypes.hiking', { defaultValue: 'Hiking' }),
  ice_hockey: (t) =>
    t('healthActivityTypes.ice_hockey', { defaultValue: 'Ice Hockey' }),
  roller_hockey: (t) =>
    t('healthActivityTypes.roller_hockey', { defaultValue: 'Roller Hockey' }),
  hunting: (t) => t('healthActivityTypes.hunting', { defaultValue: 'Hunting' }),
  lacrosse: (t) =>
    t('healthActivityTypes.lacrosse', { defaultValue: 'Lacrosse' }),
  martial_arts: (t) =>
    t('healthActivityTypes.martial_arts', { defaultValue: 'Martial Arts' }),
  mind_and_body: (t) =>
    t('healthActivityTypes.mind_and_body', { defaultValue: 'Mind and Body' }),
  breathing: (t) =>
    t('healthActivityTypes.breathing', { defaultValue: 'Breathing' }),
  paddle_sports: (t) =>
    t('healthActivityTypes.paddle_sports', { defaultValue: 'Paddle Sports' }),
  play: (t) => t('healthActivityTypes.play', { defaultValue: 'Play' }),
  preparation_and_recovery: (t) =>
    t('healthActivityTypes.preparation_and_recovery', {
      defaultValue: 'Preparation and Recovery',
    }),
  racquetball: (t) =>
    t('healthActivityTypes.racquetball', { defaultValue: 'Racquetball' }),
  rowing: (t) => t('healthActivityTypes.rowing', { defaultValue: 'Rowing' }),
  rowing_machine: (t) =>
    t('healthActivityTypes.rowing_machine', { defaultValue: 'Rowing Machine' }),
  rugby: (t) => t('healthActivityTypes.rugby', { defaultValue: 'Rugby' }),
  running: (t) => t('healthActivityTypes.running', { defaultValue: 'Running' }),
  running_treadmill: (t) =>
    t('healthActivityTypes.running_treadmill', {
      defaultValue: 'Treadmill Running',
    }),
  sailing: (t) => t('healthActivityTypes.sailing', { defaultValue: 'Sailing' }),
  skating: (t) => t('healthActivityTypes.skating', { defaultValue: 'Skating' }),
  ice_skating: (t) =>
    t('healthActivityTypes.ice_skating', { defaultValue: 'Ice Skating' }),
  snowshoeing: (t) =>
    t('healthActivityTypes.snowshoeing', { defaultValue: 'Snowshoeing' }),
  soccer: (t) => t('healthActivityTypes.soccer', { defaultValue: 'Soccer' }),
  softball: (t) =>
    t('healthActivityTypes.softball', { defaultValue: 'Softball' }),
  squash: (t) => t('healthActivityTypes.squash', { defaultValue: 'Squash' }),
  stair_climbing_machine: (t) =>
    t('healthActivityTypes.stair_climbing_machine', {
      defaultValue: 'Stair Climbing Machine',
    }),
  surfing: (t) => t('healthActivityTypes.surfing', { defaultValue: 'Surfing' }),
  swimming_pool: (t) =>
    t('healthActivityTypes.swimming_pool', { defaultValue: 'Pool Swimming' }),
  swimming_open_water: (t) =>
    t('healthActivityTypes.swimming_open_water', {
      defaultValue: 'Open Water Swimming',
    }),
  table_tennis: (t) =>
    t('healthActivityTypes.table_tennis', { defaultValue: 'Table Tennis' }),
  tennis: (t) => t('healthActivityTypes.tennis', { defaultValue: 'Tennis' }),
  track_and_field: (t) =>
    t('healthActivityTypes.track_and_field', {
      defaultValue: 'Track and Field',
    }),
  strength_training: (t) =>
    t('healthActivityTypes.strength_training', {
      defaultValue: 'Strength Training',
    }),
  weightlifting: (t) =>
    t('healthActivityTypes.weightlifting', { defaultValue: 'Weightlifting' }),
  volleyball: (t) =>
    t('healthActivityTypes.volleyball', { defaultValue: 'Volleyball' }),
  walking: (t) => t('healthActivityTypes.walking', { defaultValue: 'Walking' }),
  walking_treadmill: (t) =>
    t('healthActivityTypes.walking_treadmill', {
      defaultValue: 'Indoor Walking',
    }),
  water_fitness: (t) =>
    t('healthActivityTypes.water_fitness', { defaultValue: 'Water Fitness' }),
  water_polo: (t) =>
    t('healthActivityTypes.water_polo', { defaultValue: 'Water Polo' }),
  water_sports: (t) =>
    t('healthActivityTypes.water_sports', { defaultValue: 'Water Sports' }),
  wrestling: (t) =>
    t('healthActivityTypes.wrestling', { defaultValue: 'Wrestling' }),
  yoga: (t) => t('healthActivityTypes.yoga', { defaultValue: 'Yoga' }),
  barre: (t) => t('healthActivityTypes.barre', { defaultValue: 'Barre' }),
  core_training: (t) =>
    t('healthActivityTypes.core_training', { defaultValue: 'Core Training' }),
  calisthenics: (t) =>
    t('healthActivityTypes.calisthenics', { defaultValue: 'Calisthenics' }),
  cross_country_skiing: (t) =>
    t('healthActivityTypes.cross_country_skiing', {
      defaultValue: 'Cross Country Skiing',
    }),
  downhill_skiing: (t) =>
    t('healthActivityTypes.downhill_skiing', {
      defaultValue: 'Downhill Skiing',
    }),
  stretching: (t) =>
    t('healthActivityTypes.stretching', { defaultValue: 'Stretching' }),
  hiit: (t) =>
    t('healthActivityTypes.hiit', {
      defaultValue: 'High Intensity Interval Training',
    }),
  jump_rope: (t) =>
    t('healthActivityTypes.jump_rope', { defaultValue: 'Jump Rope' }),
  kickboxing: (t) =>
    t('healthActivityTypes.kickboxing', { defaultValue: 'Kickboxing' }),
  pilates: (t) => t('healthActivityTypes.pilates', { defaultValue: 'Pilates' }),
  snowboarding: (t) =>
    t('healthActivityTypes.snowboarding', { defaultValue: 'Snowboarding' }),
  stairs: (t) => t('healthActivityTypes.stairs', { defaultValue: 'Stairs' }),
  step_training: (t) =>
    t('healthActivityTypes.step_training', { defaultValue: 'Step Training' }),
  wheelchair_walk_pace: (t) =>
    t('healthActivityTypes.wheelchair_walk_pace', {
      defaultValue: 'Wheelchair (Walk Pace)',
    }),
  wheelchair_run_pace: (t) =>
    t('healthActivityTypes.wheelchair_run_pace', {
      defaultValue: 'Wheelchair (Run Pace)',
    }),
  tai_chi: (t) => t('healthActivityTypes.tai_chi', { defaultValue: 'Tai Chi' }),
  mixed_cardio: (t) =>
    t('healthActivityTypes.mixed_cardio', { defaultValue: 'Mixed Cardio' }),
  exercise_class: (t) =>
    t('healthActivityTypes.exercise_class', { defaultValue: 'Exercise Class' }),
  boot_camp: (t) =>
    t('healthActivityTypes.boot_camp', { defaultValue: 'Boot Camp' }),
  hand_cycling: (t) =>
    t('healthActivityTypes.hand_cycling', { defaultValue: 'Hand Cycling' }),
  disc_sports: (t) =>
    t('healthActivityTypes.disc_sports', { defaultValue: 'Disc Sports' }),
  fitness_gaming: (t) =>
    t('healthActivityTypes.fitness_gaming', { defaultValue: 'Fitness Gaming' }),
  cardio_dance: (t) =>
    t('healthActivityTypes.cardio_dance', { defaultValue: 'Cardio Dance' }),
  social_dance: (t) =>
    t('healthActivityTypes.social_dance', { defaultValue: 'Dance' }),
  pickleball: (t) =>
    t('healthActivityTypes.pickleball', { defaultValue: 'Pickleball' }),
  cooldown: (t) =>
    t('healthActivityTypes.cooldown', { defaultValue: 'Cooldown' }),
  underwater_diving: (t) =>
    t('healthActivityTypes.underwater_diving', {
      defaultValue: 'Underwater Diving',
    }),
  paragliding: (t) =>
    t('healthActivityTypes.paragliding', { defaultValue: 'Paragliding' }),
  other: (t) => t('healthActivityTypes.other', { defaultValue: 'Other' }),
};

export function localizeHealthActivityType(
  t: TFunction,
  key: HealthActivityType
): string {
  return HEALTH_ACTIVITY_TYPE_LABELS[key](t);
}
