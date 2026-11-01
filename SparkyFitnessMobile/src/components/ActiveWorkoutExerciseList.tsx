import { memo } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { linearLayoutTransition } from '../utils/layoutTransition';
import type { PresetSessionResponse } from '@workspace/shared';
import ActiveWorkoutExerciseCard from './ActiveWorkoutExerciseCard';
import type { SetRowAccessoryHandle } from './ActiveWorkoutSetRow';
import type { SetInputField } from './SetRowChrome';
import type { AnchorRect } from './AnchoredMenu';
import type {
  ActiveSetPatch,
  CompletedSetMap,
  PrSetMap,
} from '../stores/activeWorkoutStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';
import type { SupersetBorder } from './ActiveWorkoutRail';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

interface ActiveWorkoutExerciseListProps {
  session: PresetSessionResponse;
  userExpandedIds: ReadonlySet<string>;
  autoExpandedId: string | null;
  supersetBorders: Map<string, SupersetBorder>;
  completedSetIds: CompletedSetMap;
  prSetIds: PrSetMap;
  sessionId: string | null;
  verifiedSourcePresetId: number | undefined;
  /** False until `verifiedSourcePresetId` is final; see the card's prop. */
  historyScopeSettled: boolean;
  activeSetId: string | null;
  focusedSetKey: string | null;
  setRenderKeys: Record<string, string>;
  focusedField: SetInputField;
  metricColumn: ActiveWorkoutMetricColumn;
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
  expandedSetKey: string | null;
  noteEditorEntryId: string | null;
  cardOffsetsRef: React.MutableRefObject<Record<string, number>>;
  getImageSource: GetImageSource;
  onPressThumb: (entryId: string) => void;
  onToggleExpanded: (entryId: string) => void;
  onPressRestChip: (entryId: string, currentSec: number | null) => void;
  onPressMetricHeader: (anchor: AnchorRect, clampedToRpe: boolean) => void;
  onPressOverflow: (entryId: string) => void;
  /** Opens ranked alternatives from the adaptive banner (#1560). */
  onSeeAlternatives?: (entryId: string) => void;
  onCompleteSet: (setId: string) => void;
  onUncomplete: (setId: string) => void;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
  onDeleteSet: (setId: string) => void;
  onPressSetType: (setId: string, anchor: AnchorRect) => void;
  onToggleSetDetail: (setKey: string) => void;
  onAddSet: (entryId: string) => void;
  onCommitExerciseNote: (entryId: string, text: string) => void;
  onActivateSet: (setKey: string, field: Exclude<SetInputField, 'rpe'>) => void;
  onActivateRpe: (setKey: string) => void;
  onRegisterAccessoryHandle: (
    key: string,
    handle: SetRowAccessoryHandle | null
  ) => void;
}

function ActiveWorkoutExerciseList({
  session,
  userExpandedIds,
  autoExpandedId,
  supersetBorders,
  completedSetIds,
  prSetIds,
  sessionId,
  verifiedSourcePresetId,
  historyScopeSettled,
  activeSetId,
  focusedSetKey,
  setRenderKeys,
  focusedField,
  metricColumn,
  weightUnit,
  distanceUnit,
  expandedSetKey,
  noteEditorEntryId,
  cardOffsetsRef,
  getImageSource,
  onPressThumb,
  onToggleExpanded,
  onPressRestChip,
  onPressMetricHeader,
  onPressOverflow,
  onSeeAlternatives,
  onCompleteSet,
  onUncomplete,
  onCommitField,
  onDeleteSet,
  onPressSetType,
  onToggleSetDetail,
  onAddSet,
  onCommitExerciseNote,
  onActivateSet,
  onActivateRpe,
  onRegisterAccessoryHandle,
}: ActiveWorkoutExerciseListProps) {
  // The card holding the focused set is the only one handed the focus props;
  // every other card keeps null/undefined so its memo holds while the lifter
  // moves between cells (each move rewrites focusedSetKey/focusedField).
  const focusedEntryId =
    focusedSetKey == null
      ? null
      : (session.exercises.find((e) =>
          e.sets.some((s) => {
            const id = String(s.id);
            return (setRenderKeys[id] ?? id) === focusedSetKey;
          })
        )?.id ?? null);

  return (
    <>
      {session.exercises.map((exercise) => {
        const isExpanded =
          userExpandedIds.has(exercise.id) || autoExpandedId === exercise.id;
        const supersetBorder = supersetBorders.get(exercise.id) ?? null;
        const ownsFocus = exercise.id === focusedEntryId;
        const card = (
          <ActiveWorkoutExerciseCard
            exercise={exercise}
            expanded={isExpanded}
            completedSetIds={completedSetIds}
            prSetIds={prSetIds}
            excludePresetEntryId={sessionId ?? undefined}
            sourcePresetId={verifiedSourcePresetId}
            historyScopeSettled={historyScopeSettled}
            activeSetId={activeSetId}
            focusedSetKey={ownsFocus ? focusedSetKey : null}
            setRenderKeys={setRenderKeys}
            activeField={ownsFocus ? focusedField : undefined}
            metricColumn={metricColumn}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
            getImageSource={getImageSource}
            onPressThumb={onPressThumb}
            onToggleExpanded={onToggleExpanded}
            onPressRestChip={onPressRestChip}
            onPressMetricHeader={onPressMetricHeader}
            onPressOverflow={onPressOverflow}
            onSeeAlternatives={onSeeAlternatives}
            onComplete={onCompleteSet}
            onUncomplete={onUncomplete}
            onCommitField={onCommitField}
            onDeleteSet={onDeleteSet}
            onPressSetType={onPressSetType}
            onLongPressSet={onToggleSetDetail}
            onAddSet={onAddSet}
            expandedSetKey={expandedSetKey}
            noteEditorOpen={noteEditorEntryId === exercise.id}
            onCommitExerciseNote={onCommitExerciseNote}
            onActivateSet={onActivateSet}
            onActivateRpe={onActivateRpe}
            onRegisterAccessoryHandle={onRegisterAccessoryHandle}
          />
        );

        return (
          <Animated.View
            key={exercise.id}
            layout={linearLayoutTransition(300)}
            onLayout={(e) => {
              cardOffsetsRef.current[exercise.id] = e.nativeEvent.layout.y;
            }}
          >
            {supersetBorder ? (
              <View style={{ paddingLeft: 10 }}>
                <View
                  testID={`superset-rail-${exercise.id}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: supersetBorder.isLast && isExpanded ? 8 : 0,
                    width: 3,
                    backgroundColor: supersetBorder.color,
                  }}
                />
                {card}
              </View>
            ) : (
              card
            )}
          </Animated.View>
        );
      })}
    </>
  );
}

export default memo(ActiveWorkoutExerciseList);
