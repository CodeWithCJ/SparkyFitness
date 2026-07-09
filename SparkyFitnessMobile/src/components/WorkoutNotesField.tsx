import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import FormInput from './FormInput';

interface WorkoutNotesFieldProps {
  /** Committed note text (null/undefined → empty). Re-seeds the draft when it changes. */
  value: string | null | undefined;
  /** Called with the raw draft on blur; the parent owns trimming and the store write. */
  onCommit: (text: string) => void;
  label?: string;
  placeholder?: string;
  accessibilityLabel?: string;
}

/**
 * A labeled multiline notes input with a local draft, committed on blur and
 * flushed again on unmount. Dumb by design — the parent owns persistence
 * (per-set via `updateSetField`, per-exercise via `setExerciseNotes`). Shared
 * by the per-set row expand and the per-exercise card note (rule of two).
 *
 * The draft re-seeds whenever the incoming `value` changes: the field can be
 * pointed at a different set (expand target switch) or an autosave
 * reconciliation can rewrite the session under a mounted field, so a one-shot
 * `useState` initializer is not enough. Uses the same render-phase re-seed
 * pattern `ActiveWorkoutSetRow` uses for its drafts. Commits fire only on blur
 * and unmount (never mid-edit), so a re-seed can't clobber text a user is
 * typing — the store doesn't move under a focused field.
 */
function WorkoutNotesField({
  value,
  onCommit,
  label = 'Notes',
  placeholder = 'Add a note…',
  accessibilityLabel,
}: WorkoutNotesFieldProps) {
  const seeded = value ?? '';
  const [draft, setDraft] = useState(seeded);
  const [prevSeeded, setPrevSeeded] = useState(seeded);
  if (seeded !== prevSeeded) {
    setPrevSeeded(seeded);
    setDraft(seeded);
  }

  // Latest draft / committed value / handler for the unmount flush below, which
  // captures its closure once but must act on the current text.
  const latest = useRef({ draft, seeded, onCommit });
  latest.current = { draft, seeded, onCommit };

  // Flush an uncommitted draft on unmount. Blur alone can't be trusted to land
  // the note: the field is torn down when the set-note panel is toggled shut, a
  // set is logged (which clears the panel), or the exercise card collapses — and
  // RN may never deliver the native blur to JS before the unmount. This mirrors
  // why ActiveWorkoutSetRow commits its value drafts on deactivation rather than
  // relying on onBlur. Only commit when the draft diverges from the committed
  // value so an unchanged note doesn't churn the store; a blur that *did* fire
  // re-seeds the draft to match, so it won't be re-applied here.
  useEffect(() => {
    return () => {
      const { draft: pending, seeded: committed, onCommit: commit } = latest.current;
      if (pending !== committed) commit(pending);
    };
  }, []);

  return (
    <View>
      {label ? (
        <Text className="text-xs font-semibold uppercase text-text-muted mb-1">{label}</Text>
      ) : null}
      <FormInput
        value={draft}
        onChangeText={setDraft}
        onBlur={() => onCommit(draft)}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel ?? label}
        multiline
        style={{ minHeight: 64, textAlignVertical: 'top' }}
      />
    </View>
  );
}

export default WorkoutNotesField;
