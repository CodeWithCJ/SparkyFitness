import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DurationWheel from './DurationWheel';
import Button from './ui/Button';
import { formatRestLabel, formatRestRangeLabel } from './RestPeriodChip';
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
  present: (exerciseName: string, sets: ExerciseSetRestItem[], isSupersetRound?: boolean) => void;
  dismiss: () => void;
}

interface ExerciseSetRestSheetProps {
  onApply: (updates: ExerciseSetRestUpdate[]) => void;
}

const ALL_KEY = 'all';
const MAX_REST_SEC = 1800;

function clampRestSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return getDefaultRestSec();
  return Math.max(0, Math.min(MAX_REST_SEC, Math.round(seconds)));
}

const ExerciseSetRestSheet = forwardRef<ExerciseSetRestSheetRef, ExerciseSetRestSheetProps>(
  ({ onApply }, ref) => {
    const { t } = useTranslation();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [surfaceBg, textMuted, accentPrimary] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-accent-primary',
    ]) as [string, string, string];

    const [title, setTitle] = useState('');
    const [sets, setSets] = useState<ExerciseSetRestItem[]>([]);
    const [selectedKey, setSelectedKey] = useState<string>(ALL_KEY);
    const [initialBySetId, setInitialBySetId] = useState<Record<string, number>>({});
    const [draftBySetId, setDraftBySetId] = useState<Record<string, number>>({});
    const [isSupersetRound, setIsSupersetRound] = useState(false);
    const [allOverwriteConfirmed, setAllOverwriteConfirmed] = useState(false);
    const [wheelResetNonce, setWheelResetNonce] = useState(0);

    // Detect if the current draft rest times are mixed (not all equal)
    const restTimesMixed = useMemo(() => {
      const values = Object.values(draftBySetId);
      if (values.length <= 1) return false;
      const first = values[0];
      return values.some((v) => v !== first);
    }, [draftBySetId]);

    useImperativeHandle(ref, () => ({
      present: (exerciseName, incomingSets, supersetRound = false) => {
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
        setIsSupersetRound(supersetRound);
        setSelectedKey(ALL_KEY);
        setAllOverwriteConfirmed(false);
        setWheelResetNonce(0);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useSheetBackdrop();
    const restTitle = isSupersetRound
      ? t('exerciseSetRest.roundRest', { defaultValue: 'Round Rest' })
      : t('exerciseSetRest.rest', { defaultValue: 'Rest' });
    const itemTitle = isSupersetRound
      ? t('exerciseSetRest.round', { defaultValue: 'Round' })
      : t('exerciseSetRest.set', { defaultValue: 'Set' });

    const selectedSeconds = useMemo(() => {
      if (selectedKey === ALL_KEY) {
        return sets[0] ? draftBySetId[sets[0].setId] ?? getDefaultRestSec() : getDefaultRestSec();
      }
      return draftBySetId[selectedKey] ?? getDefaultRestSec();
    }, [draftBySetId, selectedKey, sets]);

    const allSetRests = useMemo(() => {
      return sets.map((set) => draftBySetId[set.setId] ?? getDefaultRestSec());
    }, [draftBySetId, sets]);

    const handleChangeSeconds = useCallback(
      (seconds: number) => {
        const next = clampRestSeconds(seconds);

        const applyChange = () => {
          setDraftBySetId((prev) => {
            if (selectedKey === ALL_KEY) {
              const out = { ...prev };
              for (const set of sets) out[set.setId] = next;
              return out;
            }
            return { ...prev, [selectedKey]: next };
          });
        };

        // If changing all sets from a currently-mixed state, confirm once.
        if (selectedKey === ALL_KEY && restTimesMixed && !allOverwriteConfirmed) {
          Alert.alert(
            t('exerciseSetRest.overwriteTitle', { defaultValue: 'Overwrite rest times?' }),
            t('exerciseSetRest.overwriteMessage', { defaultValue: 'These sets have different rest times. Set all to {{rest}}?', rest: formatRestLabel(next, t('restPeriod.off', { defaultValue: 'Off' })) }),
            [
              {
                text: t('common.cancel', { defaultValue: 'Cancel' }),
                style: 'cancel',
                onPress: () => {
                  // Reset wheel position to the current selected value.
                  setWheelResetNonce((n) => n + 1);
                },
              },
              {
                text: t('common.overwrite', { defaultValue: 'Overwrite' }),
                onPress: () => {
                  setAllOverwriteConfirmed(true);
                  applyChange();
                },
              },
            ],
          );
          return;
        }

        applyChange();
      },
      [selectedKey, sets, restTimesMixed, allOverwriteConfirmed, t],
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
        // On Android the sheet's content pan gesture steals vertical drags from
        // the wheel picker's FlatLists. Must stay static; toggling it remounts content.
        enableContentPanningGesture={Platform.OS !== 'android'}
        containerComponent={sheetContainer}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
      >
        <BottomSheetView className="px-5 pb-safe-or-8">
          <Text className="text-lg font-semibold text-text-primary text-center mb-3">
            {restTitle} — {title}
          </Text>

          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <Pressable
              onPress={() => setSelectedKey(ALL_KEY)}
              className="px-3 py-2 rounded-lg border items-center"
              style={{
                borderColor: selectedKey === ALL_KEY ? accentPrimary : textMuted,
                backgroundColor: 'transparent',
              }}
            >
              <Text
                className={
                  selectedKey === ALL_KEY
                    ? 'font-semibold text-text-primary'
                    : 'text-text-secondary'
                }
                style={selectedKey === ALL_KEY ? { color: accentPrimary } : undefined}
              >
                {t('exerciseSetRest.all', { defaultValue: 'All' })}
              </Text>
              <Text
                className={
                  selectedKey === ALL_KEY
                    ? 'text-xs mt-0.5 font-semibold text-text-primary'
                    : 'text-xs mt-0.5 text-text-primary'
                }
                style={selectedKey === ALL_KEY ? { color: accentPrimary } : undefined}
              >
                {formatRestRangeLabel(allSetRests, getDefaultRestSec(), t('restPeriod.off', { defaultValue: 'Off' }))}
              </Text>
            </Pressable>
            {sets.map((set) => {
              const selected = selectedKey === set.setId;
              const setRest = draftBySetId[set.setId] ?? getDefaultRestSec();
              return (
                <Pressable
                  key={set.setId}
                  onPress={() => setSelectedKey(set.setId)}
                  className="px-3 py-2 rounded-lg border items-center"
                  style={{
                    borderColor: selected ? accentPrimary : textMuted,
                    backgroundColor: 'transparent',
                  }}
                >
                    <Text
                      className={selected ? 'font-semibold text-text-primary' : 'text-text-secondary'}
                      style={selected ? { color: accentPrimary } : undefined}
                    >
                      {itemTitle} {set.setNumber}
                    </Text>
                    <Text
                      className={
                        selected
                          ? 'text-xs mt-0.5 font-semibold text-text-primary'
                          : 'text-xs mt-0.5 text-text-primary'
                      }
                      style={selected ? { color: accentPrimary } : undefined}
                    >
                    {formatRestLabel(setRest, t('restPeriod.off', { defaultValue: 'Off' }))}
                    </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="pt-3 pb-2">
            <DurationWheel
              key={`${selectedKey}:${wheelResetNonce}`}
              valueSec={selectedSeconds}
              onChangeSec={handleChangeSeconds}
              maxSec={MAX_REST_SEC}
            />
          </View>

          <Button variant="primary" onPress={handleDone}>
            {t('common.done', { defaultValue: 'Done' })}
          </Button>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

ExerciseSetRestSheet.displayName = 'ExerciseSetRestSheet';

export default ExerciseSetRestSheet;