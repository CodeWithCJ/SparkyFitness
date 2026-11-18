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
import FocusPage, { FocusPageButton } from './FocusPage';
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
  present: (
    exerciseName: string,
    sets: ExerciseSetRestItem[],
    isSupersetRound?: boolean
  ) => void;
  dismiss: () => void;
}

interface ExerciseSetRestSheetProps {
  onApply: (updates: ExerciseSetRestUpdate[]) => void;
  /**
   * `page` is the focus view's full-screen Rest period page (a row per set,
   * Off and -15 / +15 s); `sheet` (default) is the list view's wheel sheet.
   */
  appearance?: 'sheet' | 'page';
}

const REST_STEP_SEC = 15;

const ALL_KEY = 'all';
const MAX_REST_SEC = 1800;

function clampRestSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return getDefaultRestSec();
  return Math.max(0, Math.min(MAX_REST_SEC, Math.round(seconds)));
}

const ExerciseSetRestSheet = forwardRef<
  ExerciseSetRestSheetRef,
  ExerciseSetRestSheetProps
>(({ onApply, appearance = 'sheet' }, ref) => {
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
  const [initialBySetId, setInitialBySetId] = useState<Record<string, number>>(
    {}
  );
  const [draftBySetId, setDraftBySetId] = useState<Record<string, number>>({});
  const [isSupersetRound, setIsSupersetRound] = useState(false);
  const [allOverwriteConfirmed, setAllOverwriteConfirmed] = useState(false);
  const [wheelResetNonce, setWheelResetNonce] = useState(0);
  const [pageVisible, setPageVisible] = useState(false);

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
      for (const set of normalizedSets)
        byId[set.setId] = set.restSec ?? getDefaultRestSec();
      setTitle(exerciseName);
      setSets(normalizedSets);
      setInitialBySetId(byId);
      setDraftBySetId(byId);
      setIsSupersetRound(supersetRound);
      setSelectedKey(ALL_KEY);
      setAllOverwriteConfirmed(false);
      setWheelResetNonce(0);
      if (appearance === 'page') setPageVisible(true);
      else sheetRef.current?.present();
    },
    dismiss: () => {
      setPageVisible(false);
      sheetRef.current?.dismiss();
    },
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
      return sets[0]
        ? (draftBySetId[sets[0].setId] ?? getDefaultRestSec())
        : getDefaultRestSec();
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
          t('exerciseSetRest.overwriteTitle', {
            defaultValue: 'Overwrite rest times?',
          }),
          t('exerciseSetRest.overwriteMessage', {
            defaultValue:
              'These sets have different rest times. Set all to {{rest}}?',
            rest: formatRestLabel(
              next,
              t('restPeriod.off', { defaultValue: 'Off' })
            ),
          }),
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
          ]
        );
        return;
      }

      applyChange();
    },
    [selectedKey, sets, restTimesMixed, allOverwriteConfirmed, t]
  );

  const handleDone = useCallback(() => {
    const updates: ExerciseSetRestUpdate[] = [];
    for (const set of sets) {
      const next = draftBySetId[set.setId];
      const initial = initialBySetId[set.setId];
      if (next !== initial) updates.push({ setId: set.setId, seconds: next });
    }
    if (updates.length > 0) onApply(updates);
    setPageVisible(false);
    sheetRef.current?.dismiss();
  }, [draftBySetId, initialBySetId, onApply, sets]);

  if (appearance === 'page') {
    const offLabel = t('restPeriod.off', { defaultValue: 'Off' });
    const rows: { key: string; label: string; seconds: number }[] = [
      {
        key: ALL_KEY,
        label: t('exerciseSetRest.allSets', { defaultValue: 'All sets' }),
        seconds: selectedSeconds,
      },
      ...sets.map((set) => ({
        key: set.setId,
        label: `${itemTitle} ${set.setNumber}`,
        seconds: draftBySetId[set.setId] ?? getDefaultRestSec(),
      })),
    ];
    const stepButton =
      'h-14 flex-1 items-center justify-center rounded-full bg-raised active:opacity-70';
    return (
      <FocusPage
        visible={pageVisible}
        title={`${restTitle} · ${title}`}
        onClose={() => setPageVisible(false)}
        footer={
          <FocusPageButton
            label={t('common.done', { defaultValue: 'Done' })}
            onPress={handleDone}
          />
        }
      >
        <Text
          accessibilityRole="header"
          className="text-[26px] font-extrabold text-text-primary"
        >
          {isSupersetRound
            ? t('exerciseSetRest.roundRestPeriod', {
                defaultValue: 'Round rest period',
              })
            : t('exerciseSetRest.restPeriod', { defaultValue: 'Rest period' })}
        </Text>
        <Text className="text-[15px] text-text-secondary">
          {t('exerciseSetRest.pageHint', {
            defaultValue:
              'Set it for every set, or one set at a time. New exercises start from your default rest.',
          })}
        </Text>
        <View className="overflow-hidden rounded-3xl bg-surface px-4">
          {rows.map((row, index) => {
            const selected = selectedKey === row.key;
            const allRow = row.key === ALL_KEY;
            const value = allRow
              ? formatRestRangeLabel(allSetRests, getDefaultRestSec(), offLabel)
              : formatRestLabel(row.seconds, offLabel);
            return (
              <Pressable
                key={row.key}
                testID={`rest-row-${row.key}`}
                onPress={() => setSelectedKey(row.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${row.label}, ${value}`}
                className={`h-[52px] flex-row items-center justify-between ${index > 0 ? 'border-t border-border-subtle' : ''}`}
              >
                <Text className="text-[17px] font-bold text-text-primary">
                  {row.label}
                </Text>
                <View
                  className={`min-w-[64px] items-center rounded-full px-3 py-2 ${allRow ? '' : 'bg-raised'}`}
                  style={
                    selected
                      ? { borderWidth: 2, borderColor: accentPrimary }
                      : allRow
                        ? undefined
                        : { borderWidth: 2, borderColor: 'transparent' }
                  }
                >
                  <Text
                    className="text-[17px] font-bold text-text-primary"
                    style={{
                      fontVariant: ['tabular-nums'],
                      ...(allRow ? { color: accentPrimary } : null),
                    }}
                  >
                    {value}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View className="flex-row gap-3">
          <Pressable
            onPress={() => handleChangeSeconds(0)}
            accessibilityRole="button"
            className={stepButton}
          >
            <Text className="text-[17px] font-bold text-text-primary">
              {offLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleChangeSeconds(selectedSeconds - REST_STEP_SEC)}
            accessibilityRole="button"
            accessibilityLabel={t('exerciseSetRest.lessLabel', {
              defaultValue: 'Subtract 15 seconds',
            })}
            className={stepButton}
          >
            <Text className="text-[17px] font-bold text-text-primary">
              {t('exerciseSetRest.less', { defaultValue: '− 15 s' })}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleChangeSeconds(selectedSeconds + REST_STEP_SEC)}
            accessibilityRole="button"
            accessibilityLabel={t('exerciseSetRest.moreLabel', {
              defaultValue: 'Add 15 seconds',
            })}
            className={stepButton}
          >
            <Text className="text-[17px] font-bold text-text-primary">
              {t('exerciseSetRest.more', { defaultValue: '+ 15 s' })}
            </Text>
          </Pressable>
        </View>
        <Text className="text-[15px] text-text-secondary">
          {t('exerciseSetRest.pageFootnote', {
            defaultValue:
              'While resting, the timer is a taller bar inside the workout screen, and sets stay visible below it.',
          })}
        </Text>
      </FocusPage>
    );
  }

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
              style={
                selectedKey === ALL_KEY ? { color: accentPrimary } : undefined
              }
            >
              {t('exerciseSetRest.all', { defaultValue: 'All' })}
            </Text>
            <Text
              className={
                selectedKey === ALL_KEY
                  ? 'text-xs mt-0.5 font-semibold text-text-primary'
                  : 'text-xs mt-0.5 text-text-primary'
              }
              style={
                selectedKey === ALL_KEY ? { color: accentPrimary } : undefined
              }
            >
              {formatRestRangeLabel(
                allSetRests,
                getDefaultRestSec(),
                t('restPeriod.off', { defaultValue: 'Off' })
              )}
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
                  className={
                    selected
                      ? 'font-semibold text-text-primary'
                      : 'text-text-secondary'
                  }
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
                  {formatRestLabel(
                    setRest,
                    t('restPeriod.off', { defaultValue: 'Off' })
                  )}
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
});

ExerciseSetRestSheet.displayName = 'ExerciseSetRestSheet';

export default ExerciseSetRestSheet;
