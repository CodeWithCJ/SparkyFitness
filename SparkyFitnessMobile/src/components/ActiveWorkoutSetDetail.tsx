import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import WorkoutNotesField from './WorkoutNotesField';
import type { WorkoutCardSet } from '../utils/workoutSession';
import type { ActiveSetPatch } from '../stores/activeWorkoutStore';

function interpolateTranslation(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

interface ActiveWorkoutSetDetailProps {
  set: WorkoutCardSet;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
}

/**
 * Inline panel rendered under a set row when its detail expand is open (toggled
 * by long-pressing the set row). Holds a per-set note. Kept as its own
 * component so the per-set advanced area has a home to grow into.
 */
function ActiveWorkoutSetDetail({ set, onCommitField }: ActiveWorkoutSetDetailProps) {
  const { t } = useTranslation();
  const setId = String(set.id);
  return (
    <View className="px-3 pb-3 pt-1">
      <WorkoutNotesField
        value={set.notes}
        onCommit={(text) => {
          const trimmed = text.trim();
          const nextNotes = trimmed.length > 0 ? trimmed : null;
          // Skip an unchanged note: updateSetField (unlike setExerciseNotes) has
          // no unchanged-value guard, so a redundant commit — e.g. the unmount
          // flush after a blur already landed — would bump the session revision
          // and trigger a spurious autosave.
          if ((set.notes ?? null) === nextNotes) return;
          onCommitField(setId, { notes: nextNotes });
        }}
        label={t('activeWorkout.setDetail.notes')}
        placeholder={t('activeWorkout.setDetail.addNote')}
        accessibilityLabel={interpolateTranslation(t('activeWorkout.setDetail.notesForSet', { setNumber: set.set_number }), { setNumber: set.set_number })}
      />
    </View>
  );
}

export default ActiveWorkoutSetDetail;
