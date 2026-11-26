import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  DEFAULT_DROP_SET_COUNT,
  DEFAULT_DROP_SET_PERCENT,
} from '@workspace/shared';

import FocusPage from './FocusPage';
import Icon from './Icon';
import WorkoutNotesField from './WorkoutNotesField';
import {
  useActiveWorkoutStore,
  type ActiveSetPatch,
} from '../stores/activeWorkoutStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';
import { SET_TYPE_OPTIONS } from '../utils/workoutSession';

type SetType = (typeof SET_TYPE_OPTIONS)[number];

/** Board order: Normal and Warm-up on the first line, Drop set and Failure on the second. */
const TYPE_ORDER: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const METRICS_TOP: ActiveWorkoutMetricColumn[] = ['rpe', 'rir'];
/** A table held to RPE (timed and cardio sets) cannot show RIR, so it is not offered. */
const METRICS_CLAMPED: ActiveWorkoutMetricColumn[] = ['rpe'];
const METRICS_DERIVED: ActiveWorkoutMetricColumn[] = [
  'volume',
  'e1rm',
  'tenrm',
];

interface Props {
  visible: boolean;
  setId: string;
  setNumber: number;
  currentType: string | null | undefined;
  note: string | null | undefined;
  metricColumn: ActiveWorkoutMetricColumn;
  /** Duration-like tables clamp the column to RPE; weight metrics are hidden. */
  clampedToRpe: boolean;
  onSelectType: (type: SetType) => void;
  onSelectMetric: (metric: ActiveWorkoutMetricColumn) => void;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
  onGenerateDropSets?: () => void;
  onOpenPlateCalculator?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** One rounded `bg-surface` group, its rows split by hairlines (the workout menu's cards). */
function MenuCard({ children }: { children: React.ReactNode }) {
  return (
    <View className="overflow-hidden rounded-3xl bg-surface">
      {React.Children.toArray(children).map((child, index) => (
        <View
          key={index}
          className={index > 0 ? 'border-t border-border-subtle' : ''}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

function Segment({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`h-11 flex-1 items-center justify-center rounded-full ${selected ? 'bg-accent-primary' : ''} active:opacity-70`}
    >
      <Text
        className={`text-[17px] font-bold ${selected ? 'text-white' : 'text-text-secondary'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function MenuRow({
  label,
  leading,
  leadingColor,
  value,
  icon,
  danger,
  onPress,
  testID,
  selected,
}: {
  label: string;
  leading?: string;
  leadingColor?: string;
  value?: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onPress: () => void;
  testID?: string;
  selected?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selected == null ? undefined : { selected }}
      className="min-h-12 flex-row items-center justify-between gap-4 px-5 py-2.5 active:opacity-70"
    >
      {leading != null && (
        <Text
          className="w-5 text-center text-[17px] font-bold text-text-secondary"
          style={{ fontVariant: ['tabular-nums'], color: leadingColor }}
        >
          {leading}
        </Text>
      )}
      <Text
        className={`min-w-0 flex-1 text-[17px] font-bold ${danger ? 'text-icon-danger' : 'text-text-primary'}`}
      >
        {label}
      </Text>
      {value != null && (
        <Text className="text-[17px] font-bold text-text-secondary">
          {value}
        </Text>
      )}
      {icon}
    </Pressable>
  );
}

const EXAMPLE_ROWS: {
  type: SetType;
  mark: string;
  prev: string;
  weight: string;
  reps: string;
  volume: string;
}[] = [
  {
    type: 'warmup',
    mark: 'W',
    prev: '',
    weight: '40',
    reps: '10',
    volume: '400',
  },
  {
    type: 'normal',
    mark: '1',
    prev: '80×8',
    weight: '80',
    reps: '8',
    volume: '640',
  },
  {
    type: 'normal',
    mark: '2',
    prev: '80×8',
    weight: '82.5',
    reps: '8',
    volume: '660',
  },
  { type: 'drop', mark: 'D', prev: '', weight: '75', reps: '6', volume: '450' },
  {
    type: 'drop',
    mark: 'D',
    prev: '',
    weight: '67.5',
    reps: '6',
    volume: '405',
  },
  {
    type: 'failure',
    mark: 'F',
    prev: '',
    weight: '70',
    reps: '9',
    volume: '630',
  },
];

/** What each set type means, in the order of the type picker. */
function SetTypesPage({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const weightUnit = useActiveWorkoutStore((s) => s.weightUnit);
  const [warmup, drop, danger, secondary] = useCSSVariable([
    '--color-cat-amber',
    '--color-cat-violet',
    '--color-icon-danger',
    '--color-text-secondary',
  ]) as [string, string, string, string];
  const rows: { key: SetType; mark: string; color: string; body: string }[] = [
    {
      key: 'normal',
      mark: '1',
      color: secondary,
      body: t('activeWorkout.focus.setTypes.normal', {
        defaultValue:
          'A working set. Numbered 1, 2, 3 and the one overload progression applies to.',
      }),
    },
    {
      key: 'warmup',
      mark: 'W',
      color: warmup,
      body: t('activeWorkout.focus.setTypes.warmup', {
        defaultValue:
          'A lighter set before the working sets. No number, no progression.',
      }),
    },
    {
      key: 'drop',
      mark: 'D',
      color: drop,
      body: t('activeWorkout.focus.setTypes.drop', {
        defaultValue:
          'A lighter set right after a working set. "Add {{sets}} drop sets" in the menu adds {{sets}} at -{{percent}}% each.',
        sets: DEFAULT_DROP_SET_COUNT,
        percent: DEFAULT_DROP_SET_PERCENT,
      }),
    },
    {
      key: 'failure',
      mark: 'F',
      color: danger,
      body: t('activeWorkout.focus.setTypes.failure', {
        defaultValue: 'A set taken to failure. Marked F, no number.',
      }),
    },
  ];
  const labels: Record<SetType, string> = {
    normal: t('workout.setTypeNormal', { defaultValue: 'Normal' }),
    warmup: t('workout.setTypeWarmup', { defaultValue: 'Warm-up' }),
    drop: t('workout.setTypeDropSet', { defaultValue: 'Drop set' }),
    failure: t('workout.setTypeFailure', { defaultValue: 'Failure' }),
  };
  const markColors: Record<SetType, string> = {
    normal: secondary,
    warmup,
    drop,
    failure: danger,
  };
  const exampleColumns = [
    {
      key: 'set',
      cell: 'w-[30px]',
      label: t('activeWorkout.focus.setTypes.colSet', { defaultValue: 'Set' }),
    },
    {
      key: 'prev',
      cell: 'flex-[1.2]',
      label: t('activeWorkout.focus.setTypes.colPrev', {
        defaultValue: 'Prev',
      }),
    },
    {
      key: 'weight',
      cell: 'flex-[1.6]',
      label:
        weightUnit === 'kg'
          ? t('workout.kg', { defaultValue: 'kg' })
          : t('workout.lbs', { defaultValue: 'lbs' }),
    },
    {
      key: 'reps',
      cell: 'flex-[1.6]',
      label: t('activeWorkout.focus.setTypes.colReps', {
        defaultValue: 'Reps',
      }),
    },
    {
      key: 'vol',
      cell: 'flex-[1.6]',
      label: t('activeWorkout.focus.setTypes.colVolume', {
        defaultValue: 'Vol',
      }),
    },
    { key: 'done', cell: 'w-10', label: '' },
  ];
  return (
    <FocusPage
      visible={visible}
      onClose={onClose}
      title={t('activeWorkout.focus.setTypes.title', {
        defaultValue: 'Set types',
      })}
      doneTestID="focus-set-types-done"
    >
      <Text className="text-[16px] text-text-secondary">
        {t('activeWorkout.focus.setTypes.intro', {
          defaultValue:
            'Tap the number of a set to change its type. Only normal sets are numbered.',
        })}
      </Text>
      {rows.map((row) => (
        <View key={row.key} className="flex-row items-start gap-3.5 py-1.5">
          <View className="h-12 w-12 items-center justify-center rounded-2xl bg-raised">
            <Text
              className="text-[22px] font-bold"
              style={{ color: row.color }}
            >
              {row.mark}
            </Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[19px] font-bold text-text-primary">
              {labels[row.key]}
            </Text>
            <Text className="text-[16px] text-text-secondary">{row.body}</Text>
          </View>
        </View>
      ))}
      <Text className="mt-3 text-[13px] font-extrabold uppercase tracking-wider text-text-secondary">
        {t('activeWorkout.focus.setTypes.inTheTable', {
          defaultValue: 'In the table',
        })}
      </Text>
      <View testID="focus-set-types-example" className="gap-1.5">
        <View className="flex-row items-center gap-1.5 px-0.5">
          {exampleColumns.map((column) => (
            <Text
              key={column.key}
              className={`${column.cell} text-center text-[11px] font-bold uppercase text-text-secondary`}
            >
              {column.label}
            </Text>
          ))}
        </View>
        {EXAMPLE_ROWS.map((row, i) => (
          <View key={i} className="flex-row items-center gap-1.5">
            <Text
              className="w-[30px] text-center text-[14px] font-bold"
              style={{ color: markColors[row.type] }}
            >
              {row.mark}
            </Text>
            <View className="h-[34px] flex-[1.2] items-center justify-center rounded-[12px] bg-raised">
              <Text className="text-[13px] text-text-secondary">
                {row.prev}
              </Text>
            </View>
            <View className="h-[34px] flex-[1.6] items-center justify-center rounded-[12px] bg-raised">
              <Text className="text-[16px] font-bold text-text-primary">
                {row.weight}
              </Text>
            </View>
            <View className="h-[34px] flex-[1.6] items-center justify-center rounded-[12px] bg-raised">
              <Text className="text-[16px] font-bold text-text-primary">
                {row.reps}
              </Text>
            </View>
            <View className="h-[34px] flex-[1.6] items-center justify-center rounded-[12px] bg-raised">
              <Text className="text-[13px] text-text-secondary">
                {row.volume}
              </Text>
            </View>
            <View className="h-[34px] w-[34px] items-center justify-center rounded-[12px] bg-accent-primary">
              <Icon name="checkmark" size={16} color="white" />
            </View>
          </View>
        ))}
      </View>
    </FocusPage>
  );
}

/**
 * The focus view's Set options sheet (a `FocusPage variant="sheet"`), opened
 * from a set number and laid out as the workout menu's grouped cards: set type
 * (with the types explainer), drop sets and plate calculator, the metric column
 * and set note, then delete. Same actions and handlers as the anchored Set type
 * menu the list view keeps.
 */
function FocusSetOptionsPage({
  visible,
  setId,
  setNumber,
  currentType,
  note,
  metricColumn,
  clampedToRpe,
  onSelectType,
  onSelectMetric,
  onCommitField,
  onGenerateDropSets,
  onOpenPlateCalculator,
  onDelete,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [typesOpen, setTypesOpen] = useState(false);
  const [metricOpen, setMetricOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [textPrimary, danger, warmup, drop, secondary] = useCSSVariable([
    '--color-text-primary',
    '--color-icon-danger',
    '--color-cat-amber',
    '--color-cat-violet',
    '--color-text-secondary',
  ]) as [string, string, string, string, string];
  const typeLabels: Record<SetType, string> = {
    normal: t('workout.setTypeNormal', { defaultValue: 'Normal' }),
    warmup: t('workout.setTypeWarmup', { defaultValue: 'Warm-up' }),
    drop: t('workout.setTypeDropSet', { defaultValue: 'Drop set' }),
    failure: t('workout.setTypeFailure', { defaultValue: 'Failure' }),
  };
  const typeMarks: Record<SetType, { mark: string; color: string }> = {
    normal: { mark: String(setNumber), color: secondary },
    warmup: { mark: 'W', color: warmup },
    drop: { mark: 'D', color: drop },
    failure: { mark: 'F', color: danger },
  };
  const metricLabels: Record<ActiveWorkoutMetricColumn, string> = {
    rpe: t('workout.metricRpe', { defaultValue: 'RPE' }),
    rir: t('workout.metricRir', { defaultValue: 'RIR' }),
    volume: t('activeWorkout.focus.setOptions.volume', {
      defaultValue: 'Vol',
    }),
    e1rm: t('activeWorkout.focus.setOptions.e1rm', { defaultValue: '1RM' }),
    tenrm: t('activeWorkout.focus.setOptions.tenrm', {
      defaultValue: '10RM',
    }),
  };
  // An unknown stored type reads as a normal set, as the set number's letter does.
  const current: SetType = TYPE_ORDER.includes(currentType as SetType)
    ? (currentType as SetType)
    : 'normal';
  const effectiveMetric = clampedToRpe ? 'rpe' : metricColumn;
  const chevron = <Icon name="chevron-forward" size={18} color={textPrimary} />;

  return (
    <FocusPage
      visible={visible}
      variant="sheet"
      onClose={onClose}
      doneTestID="focus-set-options-done"
      title={t('activeWorkout.focus.setOptions.title', {
        defaultValue: 'Set {{number}} options',
        number: setNumber,
      })}
    >
      <MenuCard>
        {TYPE_ORDER.map((type) => (
          <MenuRow
            key={type}
            testID={`focus-set-options-type-${type}`}
            leading={typeMarks[type].mark}
            leadingColor={typeMarks[type].color}
            label={typeLabels[type]}
            selected={type === current}
            onPress={() => onSelectType(type)}
            icon={
              type === current ? (
                <Icon name="checkmark" size={20} color={textPrimary} />
              ) : undefined
            }
          />
        ))}
        <MenuRow
          testID="focus-set-options-types"
          onPress={() => setTypesOpen(true)}
          label={t('activeWorkout.focus.setTypes.link', {
            defaultValue: 'What do the types mean?',
          })}
          icon={chevron}
        />
      </MenuCard>

      {(onGenerateDropSets != null || onOpenPlateCalculator != null) && (
        <MenuCard>
          {onGenerateDropSets != null && (
            <MenuRow
              testID="focus-set-options-drop-sets"
              onPress={onGenerateDropSets}
              label={t('workout.addDropSets', {
                sets: DEFAULT_DROP_SET_COUNT,
                percent: DEFAULT_DROP_SET_PERCENT,
                defaultValue: 'Add {{sets}} drop sets (-{{percent}}%)',
              })}
              icon={chevron}
            />
          )}
          {onOpenPlateCalculator != null && (
            <MenuRow
              testID="focus-set-options-plates"
              onPress={onOpenPlateCalculator}
              label={t('plates.calculatorTitle', {
                defaultValue: 'Plate calculator',
              })}
              icon={
                <Icon name="exercise-weights" size={20} color={textPrimary} />
              }
            />
          )}
        </MenuCard>
      )}

      <MenuCard>
        <View>
          <MenuRow
            testID="focus-set-options-metric"
            onPress={() => setMetricOpen((open) => !open)}
            label={t('activeWorkout.focus.setOptions.metricColumn', {
              defaultValue: 'Metric column',
            })}
            value={metricLabels[effectiveMetric]}
            icon={
              <Icon
                name={metricOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={textPrimary}
              />
            }
          />
          {metricOpen && (
            <View className="gap-1.5 px-4 pb-3">
              <View className="flex-row gap-1.5">
                {(clampedToRpe ? METRICS_CLAMPED : METRICS_TOP).map(
                  (metric) => (
                    <Segment
                      key={metric}
                      label={metricLabels[metric]}
                      selected={metric === effectiveMetric}
                      onPress={() => onSelectMetric(metric)}
                    />
                  )
                )}
              </View>
              {!clampedToRpe && (
                <>
                  <View className="flex-row gap-1.5">
                    {METRICS_DERIVED.map((metric) => (
                      <Segment
                        key={metric}
                        label={metricLabels[metric]}
                        selected={metric === effectiveMetric}
                        onPress={() => onSelectMetric(metric)}
                      />
                    ))}
                  </View>
                  <Text className="px-1 text-[15px] text-text-secondary">
                    {t('activeWorkout.focus.setOptions.metricHint', {
                      defaultValue:
                        'Vol, 1RM and 10RM are calculated from weight and reps.',
                    })}
                  </Text>
                </>
              )}
            </View>
          )}
        </View>
        <View>
          <MenuRow
            testID="focus-set-options-notes"
            onPress={() => setNotesOpen((open) => !open)}
            label={t('activeWorkout.setDetail.notes', {
              defaultValue: 'Set notes',
            })}
            icon={
              <Icon
                name={notesOpen ? 'chevron-up' : 'pencil'}
                size={notesOpen ? 18 : 20}
                color={textPrimary}
              />
            }
          />
          {notesOpen && (
            <View className="px-4 pb-3">
              <WorkoutNotesField
                value={note}
                onCommit={(text) => {
                  const trimmed = text.trim();
                  const next = trimmed.length > 0 ? trimmed : null;
                  if ((note ?? null) === next) return;
                  onCommitField(setId, { notes: next });
                }}
                label=""
                placeholder={t('activeWorkout.setDetail.addNote', {
                  defaultValue: 'Add a note for this set…',
                })}
                accessibilityLabel={t('activeWorkout.setDetail.notesForSet', {
                  defaultValue: 'Notes for set {{setNumber}}',
                  setNumber,
                })}
              />
            </View>
          )}
        </View>
      </MenuCard>

      <MenuCard>
        <MenuRow
          testID="focus-set-options-delete"
          danger
          onPress={onDelete}
          label={t('workout.deleteSet', { defaultValue: 'Delete set' })}
          icon={<Icon name="trash" size={20} color={danger} />}
        />
      </MenuCard>
      <SetTypesPage visible={typesOpen} onClose={() => setTypesOpen(false)} />
    </FocusPage>
  );
}

export default React.memo(FocusSetOptionsPage);
