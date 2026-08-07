import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DurationWheel from './DurationWheel';
import Button from './ui/Button';
import { formatRestLabel } from './RestPeriodChip';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import { getDefaultRestSec } from '../utils/workoutSession';

export interface ExerciseSetRestItem {
  setId: string;
  setNumber: number;
  restSec: number | null | undefined;
}

export interface ExerciseSetRestUpdate {
  setId: string;
  seconds: number;
}

export interface ExerciseSetRestSheetRef {
  present: (exerciseName: string, sets: ExerciseSetRestItem[]) => void;
  dismiss: () => void;
}

interface ExerciseSetRestSheetProps {
  onApply: (updates: ExerciseSetRestUpdate[]) => void;
}

const ALL_KEY = 'all';
const MAX_REST_SEC = 900;

function clampRestSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return getDefaultRestSec();
  return Math.max(0, Math.min(MAX_REST_SEC, Math.round(seconds)));
}

const ExerciseSetRestSheet = forwardRef<ExerciseSetRestSheetRef, ExerciseSetRestSheetProps>(
  ({ onApply }, ref) => {
    const sheetRef = useRef<BottomSheetModal>(null);
    const [surfaceBg, textMuted, accentPrimary] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-accent-primary',
    ]) as [string, string, string];

    const [title, setTitle] = useState('Exercise');
    const [sets, setSets] = useState<ExerciseSetRestItem[]>([]);
    const [selectedKey, setSelectedKey] = useState<string>(ALL_KEY);
    const [initialBySetId, setInitialBySetId] = useState<Record<string, number>>({});
    const [draftBySetId, setDraftBySetId] = useState<Record<string, number>>({});

    useImperativeHandle(ref, () => ({
      present: (exerciseName, incomingSets) => {
        const normalizedSets = incomingSets.map((s) => ({
          ...s,
          restSec: clampRestSeconds(s.restSec ?? getDefaultRestSec()),
        }));
        const byId: Record<string, number> = {};
        for (const set of normalizedSets) byId[set.setId] = set.restSec ?? getDefaultRestSec();
        setTitle(exerciseName);
        setSets(normalizedSets);
        setInitialBySetId(byId);
        setDraftBySetId(byId);
        setSelectedKey(ALL_KEY);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useSheetBackdrop();

    const selectedSeconds = useMemo(() => {
      if (selectedKey === ALL_KEY) {
        return sets[0] ? draftBySetId[sets[0].setId] ?? getDefaultRestSec() : getDefaultRestSec();
      }
      return draftBySetId[selectedKey] ?? getDefaultRestSec();
    }, [draftBySetId, selectedKey, sets]);

    const handleChangeSeconds = useCallback(
      (seconds: number) => {
        const next = clampRestSeconds(seconds);
        setDraftBySetId((prev) => {
          if (selectedKey === ALL_KEY) {
            const out = { ...prev };
            for (const set of sets) out[set.setId] = next;
            return out;
          }
          return { ...prev, [selectedKey]: next };
        });
      },
      [selectedKey, sets],
    );

    const handleDone = useCallback(() => {
      const updates: ExerciseSetRestUpdate[] = [];
      for (const set of sets) {
        const next = draftBySetId[set.setId];
        const initial = initialBySetId[set.setId];
        if (next !== initial) updates.push({ setId: set.setId, seconds: next });
      }
      if (updates.length > 0) onApply(updates);
      sheetRef.current?.dismiss();
    }, [draftBySetId, initialBySetId, onApply, sets]);

    return (
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        containerComponent={sheetContainer}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        <BottomSheetView className="px-5 pb-safe-or-8">
          <Text className="text-lg font-semibold text-text-primary text-center mb-3">
            Rest for {title}
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Pressable
              onPress={() => setSelectedKey(ALL_KEY)}
              className="px-3 py-2 rounded-full border"
              style={{
                borderColor: selectedKey === ALL_KEY ? accentPrimary : textMuted,
                backgroundColor: selectedKey === ALL_KEY ? accentPrimary : 'transparent',
              }}
            >
              <Text style={{ color: selectedKey === ALL_KEY ? '#fff' : textMuted }}>All</Text>
            </Pressable>
            {sets.map((set) => {
              const selected = selectedKey === set.setId;
              return (
                <Pressable
                  key={set.setId}
                  onPress={() => setSelectedKey(set.setId)}
                  className="px-3 py-2 rounded-full border"
                  style={{
                    borderColor: selected ? accentPrimary : textMuted,
                    backgroundColor: selected ? accentPrimary : 'transparent',
                  }}
                >
                  <Text style={{ color: selected ? '#fff' : textMuted }}>Set {set.setNumber}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View className="pt-3 pb-2">
            <DurationWheel valueSec={selectedSeconds} onChangeSec={handleChangeSeconds} maxSec={MAX_REST_SEC} />
            <Text className="text-center text-text-secondary mt-1">
              {selectedKey === ALL_KEY ? 'Applying to all sets' : 'Selected'}: {formatRestLabel(selectedSeconds)}
            </Text>
          </View>

          <Button variant="primary" onPress={handleDone}>
            Done
          </Button>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

ExerciseSetRestSheet.displayName = 'ExerciseSetRestSheet';

export default ExerciseSetRestSheet;