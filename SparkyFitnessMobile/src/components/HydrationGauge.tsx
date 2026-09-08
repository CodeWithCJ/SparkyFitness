import { Canvas, Group, Path, Rect, Skia } from '@shopify/react-native-skia';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { formatLocalizedNumber } from '../localization';
import {
  WATER_UNIT_LABELS,
  formatVolumeForUnit,
  volumeFromMl,
} from '../utils/unitConversions';
import Icon from './Icon';
import Button from './ui/Button';

interface ContainerOption {
  id: number;
  name: string;
}

/** A one-tap drink. Carries its own amount so the card can state it. */
interface QuickAddPreset extends ContainerOption {
  pressLabel?: string;
}

interface HydrationGaugeProps {
  consumed: number; // ml
  goal: number; // ml
  // #1557, #1629: the portion of `consumed` folded in from logged food's
  // water content. 0/undefined when the user hasn't opted in, in which case
  // no caption renders -- a caption on every day would say nothing new.
  fromFoodMl?: number;
  unit?: string;
  containerVolume?: number | null; // ml per press; null when not measured in ml
  /**
   * What one press logs when the container is linked to a food, e.g.
   * "250 ml of Ice Coffe". A linked container has no volume of its own, so
   * there is no millilitre figure to state.
   */
  linkedPressLabel?: string;
  /** Opens the container screen when there is no container to press. */
  onConfigure?: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  disableDecrement?: boolean;
  containers?: ContainerOption[];
  // A preset is one drink logged once, not a vessel to select: these render as
  // their own tap-to-log row rather than joining the container chips, which is
  // why tapping "Latte" used to select it and log nothing.
  quickAddPresets?: QuickAddPreset[];
  onQuickAdd?: (id: number) => void;
  activeContainerId?: number;
  onSelectContainer?: (id: number) => void;
}

const CANVAS_WIDTH = 70;
const CANVAS_HEIGHT = 130;

// Fillable region (bottom of lip to bottom of bottle)
const FILL_TOP = 28;
const FILL_BOTTOM = 124;
const FILL_HEIGHT = FILL_BOTTOM - FILL_TOP;

const HydrationGauge: React.FC<HydrationGaugeProps> = ({
  consumed,
  goal,
  fromFoodMl,
  unit = 'ml',
  containerVolume,
  linkedPressLabel,
  onConfigure,
  onIncrement,
  onDecrement,
  disableDecrement,
  containers,
  activeContainerId,
  onSelectContainer,
  quickAddPresets,
  onQuickAdd,
}) => {
  const { t } = useTranslation();
  const hydrationColor = useCSSVariable('--color-hydration') as string;
  const trackColor = useCSSVariable('--color-progress-track') as string;
  const outlineColor = useCSSVariable('--color-border-strong') as string;

  const progress = goal > 0 ? Math.min(consumed / goal, 1) : 0;

  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, animatedProgress]);

  const bottlePath = useMemo(() => {
    const b = Skia.PathBuilder.Make();

    // Neck
    b.moveTo(26, 6);
    b.lineTo(26, 23);

    // Lip (cap ridge)
    b.lineTo(23, 23);
    b.lineTo(23, 28);

    // Left shoulder curve
    b.cubicTo(23, 34, 12, 37, 12, 42);

    // Left body
    b.lineTo(12, 112);

    // Bottom curves
    b.cubicTo(12, 121, 20, 124, 35, 124);
    b.cubicTo(50, 124, 58, 121, 58, 112);

    // Right body
    b.lineTo(58, 42);

    // Right shoulder curve
    b.cubicTo(58, 37, 47, 34, 47, 28);

    // Lip right
    b.lineTo(47, 23);
    b.lineTo(44, 23);

    // Right neck
    b.lineTo(44, 6);

    b.close();
    return b.build();
  }, []);

  const fillPath = useDerivedValue(() => {
    const y = FILL_BOTTOM - FILL_HEIGHT * animatedProgress.value;
    return Skia.Path.Rect(Skia.XYWHRect(0, y, CANVAS_WIDTH, CANVAS_HEIGHT - y));
  });

  const displayConsumed = formatVolumeForUnit(
    volumeFromMl(consumed, unit),
    unit
  );
  const displayGoal = formatVolumeForUnit(volumeFromMl(goal, unit), unit);
  const unitLabel = WATER_UNIT_LABELS[unit] ?? unit;

  const showButtons = !!onIncrement || !!onDecrement;
  // "Nothing to press", not "no millilitres". A container linked to a food has
  // no volume of its own on purpose -- its credit is the food's water times the
  // hydration factor, which only the server can compute -- so keying the
  // buttons off containerVolume disabled a container the user had selected and
  // could see named right below them.
  const noContainer = containerVolume == null && !linkedPressLabel;
  // Shown whenever there is a vessel to name, not only when there are two to
  // choose between: with presets moved to their own row a user can be left
  // with just "Default", and hiding it then left the card silent about what
  // the +/- buttons were pressing.
  const showChips = (containers?.length ?? 0) > 0;

  const pressLabel =
    containerVolume != null
      ? t('dashboard.perPress', {
          defaultValue: '{{value}} {{unit}}',
          value: formatLocalizedNumber(volumeFromMl(containerVolume, unit), {
            maximumFractionDigits: 1,
          }),
          unit: unitLabel,
        })
      : (linkedPressLabel ?? null);

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Text className="text-md font-bold text-text-secondary mb-3">
        {t('dashboard.hydration', { defaultValue: 'Hydration' })}
      </Text>
      <View className="flex-row items-center">
        <View className="items-center mr-4">
          <View className="flex-row items-center">
            {showButtons && (
              <Button
                variant="ghost"
                onPress={onDecrement}
                disabled={disableDecrement || noContainer}
                className="p-2"
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.removeWater', {
                  defaultValue: 'Remove water',
                })}
                style={
                  disableDecrement || noContainer ? { opacity: 0.3 } : undefined
                }
              >
                <Icon name="remove-circle" size={28} color={hydrationColor} />
              </Button>
            )}
            <Canvas style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
              {/* Fill clipped to bottle shape */}
              <Group clip={bottlePath}>
                <Rect
                  x={0}
                  y={0}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  color={trackColor}
                />
                <Path path={fillPath} color={hydrationColor} />
              </Group>
              {/* Bottle outline */}
              <Path
                path={bottlePath}
                style="stroke"
                strokeWidth={2}
                color={outlineColor}
              />
            </Canvas>
            {showButtons && (
              <Button
                variant="ghost"
                onPress={onIncrement}
                disabled={noContainer}
                className="p-2"
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.addWater', {
                  defaultValue: 'Add water',
                })}
                style={noContainer ? { opacity: 0.3 } : undefined}
              >
                <Icon name="add-circle" size={28} color={hydrationColor} />
              </Button>
            )}
          </View>
          {/* Directly under the buttons it describes, rather than centred on
              the whole card where it read as belonging to the totals. */}
          {showButtons && pressLabel ? (
            <View className="rounded-full border border-border-subtle px-3 py-1 mt-2">
              <Text className="text-sm font-semibold text-accent-primary">
                {pressLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="flex-1 items-center mr-2">
          <Text className="text-2xl font-bold text-text-primary">
            {displayConsumed} {unitLabel}
          </Text>
          <Text className="text-sm text-text-secondary mt-0.5">
            {t('dashboard.ofVolume', {
              defaultValue: 'of {{value}} {{unit}}',
              value: displayGoal,
              unit: unitLabel,
            })}
          </Text>
          {!!fromFoodMl && fromFoodMl > 0 && (
            <Text className="text-xs text-text-muted mt-0.5">
              {t('dashboard.waterFromFood', {
                defaultValue: 'Includes {{value}} {{unit}} from food',
                value: formatVolumeForUnit(
                  volumeFromMl(fromFoodMl, unit),
                  unit
                ),
                unit: unitLabel,
              })}
            </Text>
          )}
          {showChips && (
            <View className="flex-row flex-wrap justify-center mt-2 gap-1">
              {containers!.map((c) => {
                const active = c.id === activeContainerId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => onSelectContainer?.(c.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('dashboard.selectContainer', {
                      defaultValue: 'Select {{container}}',
                      container: c.name,
                    })}
                    accessibilityState={{ selected: active }}
                    className={`rounded-full px-3 py-1 border ${active ? 'bg-accent-primary border-accent-primary' : 'bg-raised border-border-subtle'}`}
                  >
                    <Text
                      className={`text-xs font-medium ${active ? 'text-white' : 'text-text-primary'}`}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>
      {/* What one press logs, stated once and prominently. It was previously
          split across two muted captions -- "N ml per container" for a plain
          container and the drink name for a linked one -- either of which was
          the least readable thing on the card. */}
      {/* One tap logs the drink. These deliberately do not carry +/- of their
          own: a second latte is another tap, and removing one belongs in the
          drinks log where you can see which you are deleting. */}
      {quickAddPresets && quickAddPresets.length > 0 ? (
        <View className="mt-3 pt-3 border-t border-border-subtle">
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
            {t('dashboard.quickAddDrinks', { defaultValue: 'Quick add' })}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {quickAddPresets.map((preset) => (
              <Pressable
                key={preset.id}
                onPress={() => onQuickAdd?.(preset.id)}
                disabled={!onQuickAdd}
                accessibilityRole="button"
                accessibilityLabel={t('dashboard.logDrink', {
                  defaultValue: 'Log {{drink}}',
                  drink: preset.name,
                })}
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                className="flex-row items-center gap-2 rounded-xl border border-border-subtle bg-raised px-3 py-2"
              >
                <View className="min-w-0">
                  <Text className="text-xs font-medium text-text-primary">
                    {preset.name}
                  </Text>
                  {preset.pressLabel ? (
                    <Text className="text-[11px] text-text-muted">
                      {preset.pressLabel}
                    </Text>
                  ) : null}
                </View>
                <Icon name="add-circle" size={18} color={hydrationColor} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {/* No container to press. This used to be a dead sentence telling the
          user to go to the server; the containers screen lives here now, so
          it is a way in. */}
      {showButtons && containerVolume == null && !linkedPressLabel ? (
        <Pressable
          accessibilityRole="button"
          onPress={onConfigure}
          disabled={!onConfigure}
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
        >
          <Text
            className={`text-xs text-center mt-2 ${
              onConfigure ? 'text-accent-primary' : 'text-text-muted'
            }`}
          >
            {t('dashboard.chooseWaterContainer', {
              defaultValue:
                'Choose a water container to enable quick add/remove',
            })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

export default HydrationGauge;
