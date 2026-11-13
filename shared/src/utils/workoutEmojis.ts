/**
 * Returns a contextual emoji for a workout type (e.g. 🏋️ for Strength, 🚶 for Walking, 🚴 for Cycling, 🏃 for Running).
 * Shared across web, mobile, tooltips, and report cards.
 */
export const getWorkoutEmoji = (name?: string | null): string => {
  if (!name) return '⚡';
  const lower = name.toLowerCase();
  if (
    lower.includes('strength') ||
    lower.includes('weight') ||
    lower.includes('lift') ||
    lower.includes('bench') ||
    lower.includes('squat') ||
    lower.includes('deadlift') ||
    lower.includes('dumbbell') ||
    lower.includes('barbell') ||
    lower.includes('press') ||
    lower.includes('gym')
  ) {
    return '🏋️';
  }
  if (lower.includes('walk') || lower.includes('hike')) {
    return '🚶';
  }
  if (
    lower.includes('run') ||
    lower.includes('jog') ||
    lower.includes('treadmill') ||
    lower.includes('sprint')
  ) {
    return '🏃';
  }
  if (
    lower.includes('cycl') ||
    lower.includes('bike') ||
    lower.includes('biking') ||
    lower.includes('spin')
  ) {
    return '🚴';
  }
  if (lower.includes('swim')) {
    return '🏊';
  }
  if (lower.includes('row')) {
    return '🚣';
  }
  if (
    lower.includes('yoga') ||
    lower.includes('pilates') ||
    lower.includes('stretch') ||
    lower.includes('mobility')
  ) {
    return '🧘';
  }
  if (
    lower.includes('hiit') ||
    lower.includes('cardio') ||
    lower.includes('aerobic') ||
    lower.includes('crossfit')
  ) {
    return '⚡';
  }
  if (
    lower.includes('box') ||
    lower.includes('fight') ||
    lower.includes('martial')
  ) {
    return '🥊';
  }
  return '💪';
};
