// SparkyFitnessFrontend/src/utils/moodUtils.ts

export const getMoodDisplay = (moodValue: number | null): { emoji: string, label: string } => {
  if (moodValue === null) return { emoji: '😐', label: 'Neutral' }; // Default for null mood
  if (moodValue === 10) return { emoji: '😴', label: 'Tired' }; // 0-10
  if (moodValue <= 20) return { emoji: '😢', label: 'Sad' }; // 11-20
  if (moodValue <= 30) return { emoji: '😠', label: 'Angry' }; // 21-30
  if (moodValue <= 40) return { emoji: '😟', label: 'Worried' }; // 31-40
  if (moodValue <= 50) return { emoji: '😐', label: 'Neutral' }; // 41-50
  if (moodValue <= 60) return { emoji: '🤔', label: 'Thoughtful' }; // 51-60
  if (moodValue <= 70) return { emoji: '🙂', label: 'Calm' }; // 61-70
  if (moodValue <= 80) return { emoji: '😎', label: 'Confident' }; // 71-80
  if (moodValue <= 90) return { emoji: '😀', label: 'Happy' }; // 81-90
  return { emoji: '😍', label: 'Excited' }; // 91-100
};