import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useClockTick } from '../hooks/useClockTick';
import { useHeartRateZoneColor } from '../hooks/useHeartRateZoneColor';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';
import { useLiveHeartRate } from '../stores/liveHeartRateStore';
import { energyUnitLabel, formatEnergyNumber } from '../utils/energyUnit';
import { formatElapsed } from '../utils/workoutSession';
import type { ExerciseProgress } from '../utils/workoutProgress';
import Icon, { type IconName } from './Icon';
import LiquidGlassSurface, {
  createLiquidGlassPillStyle,
} from './LiquidGlassSurface';
import ActionSheet, {
  type ActionSheetItem,
  type ActionSheetRef,
} from './ActionSheet';

export { buildExerciseProgress } from '../utils/workoutProgress';

interface ActiveWorkoutHeaderProps {
  name: string;
  location?: string | null;
  startedAt: number | null;
  progress: ExerciseProgress[];
  onBack: () => void;
  onDiscard: () => void;
  /** Adds an "End workout" action (the finish flow) in its own menu group. */
  onEndWorkout?: () => void;
  /** Opens the rename dialog from a "Rename workout" menu action. */
  onRename?: () => void;
  /** Opens the location modal from a "Gym / Location" menu action. */
  onEditLocation?: () => void;
  /** When provided, adds an "Add exercise" action. */
  onAddExercise?: () => void;
  /** When provided, adds a "Reorder exercises" action. */
  onReorder?: () => void;
  /** When provided, adds a "Workout settings" action. */
  onOpenSettings?: () => void;
  /** When provided (any set logged), adds a "Clear all logged sets" action. */
  onClearAllSets?: () => void;
  /** Side-bar poses: the screen draws back and menu itself, in the strip. */
  buttonsInStrip?: boolean;
  /** The header publishes its menu opener here for the strip's menu button. */
  openMenuRef?: React.MutableRefObject<(() => void) | null>;
  /** The header sits in the top status row, beside the clock and Wi-Fi cluster. */
  inStatusRow?: boolean;
  /**
   * With `inStatusRow`: the system status cluster's left edge, in window
   * points (measured). A Live Activity widens it, and the title row, menu
   * button included, stops at that edge instead of a fixed width.
   */
  statusCluster?: { left: number } | null;
  /**
   * The focus view's pill bar, with the viewed exercise's position and a list
   * button. Ignored when the buttons live in a side strip, where a compact
   * title block shows instead.
   */
  focusBar: {
    position: number;
    total: number;
    onOpenList?: () => void;
    /** The viewed exercise's entry id: its live watch heart rate shows in the pill. */
    exerciseEntryId?: string | null;
    /** Workout energy so far, kcal. The calories segment shows only when set. */
    caloriesKcal?: number | null;
  };
}

/**
 * Header action button. With Liquid Glass active it floats on its own round
 * glass surface, matching the native iOS 26 bar buttons every native-header
 * screen gets (49 pt, measured on App Settings' back button); otherwise it stays a flat pressable icon.
 */
function HeaderIconButton({
  icon,
  color,
  usesGlass,
  chromeBorder,
  onPress,
  accessibilityLabel,
}: {
  icon: IconName;
  color: string;
  usesGlass: boolean;
  chromeBorder: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const button = (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={
        usesGlass ? 'h-[49px] w-[49px] items-center justify-center' : 'p-2'
      }
    >
      <Icon name={icon} size={usesGlass ? 24 : 22} color={color} />
    </Pressable>
  );

  if (!usesGlass) return button;
  return (
    <LiquidGlassSurface
      style={createLiquidGlassPillStyle(chromeBorder, {
        marginHorizontal: 0,
        marginBottom: 0,
      })}
      isInteractive
    >
      {button}
    </LiquidGlassSurface>
  );
}

// Status row geometry on the Duo's tall inner pose: the clock and Wi-Fi cluster
// are centred ~48 pt down and span the last ~120 pt of the row (measured).
const STATUS_ROW_TOP_PAD = 24;
const STATUS_CLUSTER_WIDTH = 120;

/**
 * Back and menu buttons stacked for the status strip (side-bar poses).
 */
export function ActiveWorkoutStripButtons({
  onBack,
  onMenu,
}: {
  onBack: () => void;
  onMenu: () => void;
}) {
  const { t } = useTranslation();
  const [textPrimary, chromeBorder] = useCSSVariable([
    '--color-text-primary',
    '--color-chrome-border',
  ]) as [string, string];
  const usesGlass = useNativeIOSTabsActive();
  return (
    <View className="items-center gap-2 pb-2">
      <HeaderIconButton
        icon="chevron-back"
        color={textPrimary}
        usesGlass={usesGlass}
        chromeBorder={chromeBorder}
        onPress={onBack}
        accessibilityLabel={t('activeWorkout.header.back', {
          defaultValue: 'Back',
        })}
      />
      <HeaderIconButton
        icon="ellipsis-horizontal"
        color={textPrimary}
        usesGlass={usesGlass}
        chromeBorder={chromeBorder}
        onPress={onMenu}
        accessibilityLabel={t('activeWorkout.header.menu', {
          defaultValue: 'Workout menu',
        })}
      />
    </View>
  );
}

/**
 * The "MM:SS elapsed" line. It ticks on its own once a second, so neither the
 * rest of the header nor the screen re-renders for the clock.
 */
function ElapsedTime({ startedAt }: { startedAt: number | null }) {
  const { t } = useTranslation();
  const now = useClockTick();
  return (
    <Text
      className="text-xs text-text-secondary"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {t('activeWorkout.header.elapsedTime', {
        defaultValue: '{{time}} elapsed',
        time: formatElapsed(startedAt, now),
      })}
    </Text>
  );
}

/** A 44 pt round or pill-shaped chip for the focus view's top bar. */
const FOCUS_PILL_CLASS =
  'h-11 min-w-11 flex-row items-center justify-center rounded-full bg-raised px-3.5';

/**
 * The focus bar's one centred pill: the elapsed clock, then the watch's live
 * heart rate (in its zone colour) and the workout's energy when there is one.
 * It ticks on its own like {@link ElapsedTime}; the heart rate segment
 * subscribes to the live store, so only this pill re-renders on a new reading.
 */
function StatsPill({
  startedAt,
  exerciseEntryId,
  caloriesKcal,
}: {
  startedAt: number | null;
  exerciseEntryId: string | null;
  caloriesKcal: number | null;
}) {
  const { t } = useTranslation();
  const now = useClockTick();
  const energyUnit = useEnergyUnit();
  const [heartRateColor, activeEnergyColor, borderSubtle] = useCSSVariable([
    '--color-heart-rate',
    '--color-active-energy',
    '--color-border-subtle',
  ]) as [string, string, string];
  const bpm = useLiveHeartRate(exerciseEntryId);
  const zoneColor = useHeartRateZoneColor(bpm);
  const hrColor = zoneColor ?? heartRateColor;
  const time = formatElapsed(startedAt, now);
  const showCalories = caloriesKcal != null && caloriesKcal > 0;
  const divider = (
    <View
      className="mx-2.5 h-5 w-px"
      style={{ backgroundColor: borderSubtle }}
    />
  );
  return (
    <View className={`${FOCUS_PILL_CLASS} px-3`}>
      <View
        accessible
        accessibilityLabel={t('activeWorkout.header.elapsedTime', {
          defaultValue: '{{time}} elapsed',
          time,
        })}
      >
        <Text
          className="text-[17px] font-bold text-accent-primary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {time}
        </Text>
      </View>
      {bpm != null && (
        <>
          {divider}
          <View
            testID="focus-header-heart-rate"
            className="flex-row items-center gap-1"
            accessible
            accessibilityLabel={t('activeWorkout.focus.header.heartRate', {
              defaultValue: 'Heart rate {{bpm}} bpm',
              bpm,
            })}
          >
            <Icon name="heart-rate" size={14} color={hrColor} />
            <Text
              className="text-[15px] font-bold"
              style={{ color: hrColor, fontVariant: ['tabular-nums'] }}
            >
              {bpm}
            </Text>
          </View>
        </>
      )}
      {showCalories && (
        <>
          {divider}
          <View
            testID="focus-header-calories"
            className="flex-row items-center gap-1"
            accessible
            accessibilityLabel={t('activeWorkout.focus.header.calories', {
              defaultValue: 'Energy {{value}} {{unit}}',
              value: formatEnergyNumber(caloriesKcal, energyUnit),
              unit: energyUnitLabel(energyUnit, t),
            })}
          >
            <Icon name="flame" size={14} color={activeEnergyColor} />
            <Text
              className="text-[15px] font-bold text-text-primary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatEnergyNumber(caloriesKcal, energyUnit)}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

/**
 * Custom chrome for the active-workout screen (the route renders with
 * `headerShown: false`): the focus view's pill bar (back, one centred clock / heart rate /
 * energy pill, list with the position, kebab menu), or a compact title block beside a side strip.
 */
function ActiveWorkoutHeader({
  name,
  location,
  startedAt,
  progress,
  onBack,
  onDiscard,
  onEndWorkout,
  onRename,
  onEditLocation,
  onAddExercise,
  onReorder,
  onOpenSettings,
  onClearAllSets,
  buttonsInStrip = false,
  openMenuRef,
  inStatusRow = false,
  statusCluster = null,
  focusBar,
}: ActiveWorkoutHeaderProps) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const clusterReserve =
    statusCluster != null
      ? Math.max(STATUS_CLUSTER_WIDTH, windowWidth - statusCluster.left + 8)
      : STATUS_CLUSTER_WIDTH;
  const [textPrimary, accentPrimary] = useCSSVariable([
    '--color-text-primary',
    '--color-accent-primary',
  ]) as [string, string];

  const menuSheetRef = useRef<ActionSheetRef>(null);
  const openMenu = () => menuSheetRef.current?.present();
  React.useEffect(() => {
    if (openMenuRef) openMenuRef.current = openMenu;
  });

  const doneCount = progress.filter(
    (p) => p.totalSets > 0 && p.completedSets >= p.totalSets
  ).length;
  const progressText = (
    <Text
      className="text-xs text-text-secondary"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {t('activeWorkout.header.exerciseProgress', {
        defaultValue: '{{completed}} / {{count}} exercises',
        completed: doneCount,
        count: progress.length,
      })}
    </Text>
  );

  const menuItems: ActionSheetItem[] = [];
  if (onAddExercise) {
    menuItems.push({
      key: 'add-exercise',
      icon: 'add-circle',
      label: t('activeWorkout.header.addExercise', {
        defaultValue: 'Add exercise',
      }),
      group: 'edit',
      onPress: onAddExercise,
    });
  }
  if (onReorder) {
    menuItems.push({
      key: 'reorder',
      icon: 'reorder-handle',
      label: t('activeWorkout.header.reorderExercises', {
        defaultValue: 'Reorder exercises',
      }),
      group: 'edit',
      onPress: onReorder,
    });
  }
  if (onRename) {
    menuItems.push({
      key: 'rename',
      icon: 'pencil',
      label: t('activeWorkout.header.renameWorkout', {
        defaultValue: 'Rename workout',
      }),
      group: 'workout',
      onPress: onRename,
    });
  }
  if (onEditLocation) {
    menuItems.push({
      key: 'location',
      icon: 'location',
      label: location
        ? t('activeWorkout.header.gymLocationSet', {
            defaultValue: 'Gym: {{location}}',
            location,
          })
        : t('activeWorkout.header.gymLocation', {
            defaultValue: 'Gym / Location',
          }),
      group: 'workout',
      onPress: onEditLocation,
    });
  }
  if (onOpenSettings) {
    menuItems.push({
      key: 'workout-settings',
      icon: 'settings',
      label: t('activeWorkout.header.settings', {
        defaultValue: 'Workout settings',
      }),
      group: 'workout',
      onPress: onOpenSettings,
    });
  }
  if (onEndWorkout) {
    menuItems.push({
      key: 'end-workout',
      icon: 'checkmark-circle',
      label: t('activeWorkout.header.endWorkout', {
        defaultValue: 'End workout',
      }),
      group: 'finish',
      onPress: onEndWorkout,
    });
  }
  if (onClearAllSets) {
    menuItems.push({
      key: 'clear-sets',
      icon: 'close',
      label: t('activeWorkout.header.clearAllSets', {
        defaultValue: 'Clear all logged sets',
      }),
      group: 'danger',
      destructive: true,
      onPress: onClearAllSets,
    });
  }
  menuItems.push({
    key: 'discard',
    icon: 'trash',
    label: t('activeWorkout.header.discardWorkout', {
      defaultValue: 'Discard workout',
    }),
    group: 'danger',
    destructive: true,
    onPress: onDiscard,
  });

  if (!buttonsInStrip) {
    return (
      <View
        className="px-4 pb-1 bg-background"
        style={inStatusRow ? { paddingTop: STATUS_ROW_TOP_PAD } : undefined}
      >
        <View
          className="flex-row items-center gap-2"
          style={inStatusRow ? { marginRight: clusterReserve } : undefined}
        >
          <Pressable
            onPress={onBack}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t('activeWorkout.header.back', {
              defaultValue: 'Back',
            })}
            className={`${FOCUS_PILL_CLASS} w-11 px-0 active:opacity-70`}
          >
            <Icon name="chevron-back" size={22} color={textPrimary} />
          </Pressable>
          <View className="flex-1 items-center">
            <StatsPill
              startedAt={startedAt}
              exerciseEntryId={focusBar.exerciseEntryId ?? null}
              caloriesKcal={focusBar.caloriesKcal ?? null}
            />
          </View>
          {focusBar.onOpenList != null && (
            <Pressable
              onPress={focusBar.onOpenList}
              accessibilityRole="button"
              accessibilityLabel={t('activeWorkout.focus.header.list', {
                defaultValue: 'Exercise list',
              })}
              accessibilityValue={{
                text: t('activeWorkout.focus.header.position', {
                  defaultValue: 'Exercise {{position}} of {{total}}',
                  position: focusBar.position,
                  total: focusBar.total,
                }),
              }}
              className={`${FOCUS_PILL_CLASS} w-11 flex-col px-0 active:opacity-70`}
            >
              <Icon name="list" size={18} color={textPrimary} />
              <Text
                className="text-[10px] font-bold text-accent-primary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {`${focusBar.position}/${focusBar.total}`}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel={t('activeWorkout.header.menu', {
              defaultValue: 'Workout menu',
            })}
            className={`${FOCUS_PILL_CLASS} w-11 px-0 active:opacity-70`}
          >
            <Icon name="ellipsis-horizontal" size={22} color={textPrimary} />
          </Pressable>
        </View>
        <ActionSheet
          ref={menuSheetRef}
          title={name}
          items={menuItems}
          layout="cards"
        />
      </View>
    );
  }

  // Side-strip poses: the screen draws back and menu in the strip, so the
  // header is only the compact title block.
  return (
    <View
      className="px-3 pb-2 border-b border-border-subtle bg-background"
      style={inStatusRow ? { paddingTop: STATUS_ROW_TOP_PAD } : undefined}
    >
      <View
        className="flex-row items-center"
        style={inStatusRow ? { marginRight: clusterReserve } : undefined}
      >
        <View className="flex-1 items-center">
          <Text
            numberOfLines={1}
            className="text-base font-semibold text-text-primary"
          >
            {name}
          </Text>
          <View className="flex-row items-center gap-2">
            <ElapsedTime startedAt={startedAt} />
            <Text className="text-xs text-text-secondary">·</Text>
            {progressText}
            {location ? (
              <Pressable
                onPress={onEditLocation}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                className="flex-row items-center gap-0.5"
              >
                <Icon name="location" size={12} color={accentPrimary} />
                <Text
                  numberOfLines={1}
                  className="text-xs font-medium"
                  style={{ color: accentPrimary, maxWidth: 120 }}
                >
                  {location}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <ActionSheet
        ref={menuSheetRef}
        title={name}
        items={menuItems}
        layout="cards"
      />
    </View>
  );
}

export default React.memo(ActiveWorkoutHeader);
