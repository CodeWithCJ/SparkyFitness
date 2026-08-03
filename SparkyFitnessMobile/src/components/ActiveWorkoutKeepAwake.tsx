import { useKeepAwake } from 'expo-keep-awake';

import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

// The wake lock is scoped to this component's lifetime: `useKeepAwake`
// releases it on unmount, so conditional mounting is the whole on/off logic.
const KeepAwakeLock: React.FC = () => {
  useKeepAwake('active-workout');
  return null;
};

/**
 * Keeps the screen on anywhere in the app while a workout is active, when the
 * Workout Settings "Keep screen awake" toggle is on.
 */
const ActiveWorkoutKeepAwake: React.FC = () => {
  const enabled = useAppPreferencesStore((s) => s.workoutKeepAwakeEnabled);
  const workoutActive = useActiveWorkoutStore((s) => s.sessionId !== null);
  return enabled && workoutActive ? <KeepAwakeLock /> : null;
};

export default ActiveWorkoutKeepAwake;
