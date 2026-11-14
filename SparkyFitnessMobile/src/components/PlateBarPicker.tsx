import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { PlateBar, PlateUnit } from '@workspace/shared';
import Icon from './Icon';
import { barLabel, formatPlateWeight } from '../utils/plateFormat';
import { plateUnitLabel } from '../utils/plateUnitLabel';

interface Props {
  bars: readonly PlateBar[];
  selectedId: string | null;
  /** The bar the equipment calls for; always one of the two segments. */
  suggestedId: string | null;
  unit: PlateUnit;
  onSelect: (id: string) => void;
}

/**
 * The two bars the segmented control shows: the suggested one and the most
 * likely other (the picked bar when it is neither, else the next in the
 * lifter's list). Up to two bars fit without the "More bars" chip.
 */
export function pickerBars(
  bars: readonly PlateBar[],
  selectedId: string | null,
  suggestedId: string | null
): { segments: PlateBar[]; hasMore: boolean } {
  if (bars.length <= 2) return { segments: [...bars], hasMore: false };
  const first = bars.find((b) => b.id === suggestedId) ?? bars[0]!;
  const rest = bars.filter((b) => b.id !== first.id);
  const other = rest.find((b) => b.id === selectedId) ?? rest[0]!;
  return { segments: [first, other], hasMore: true };
}

/**
 * Bar choice for the plate calculator page: a segmented control with up to
 * two bars, and a "More bars" chip that lists the rest of the equipment.
 * Labels wrap rather than truncate.
 */
export default function PlateBarPicker({
  bars,
  selectedId,
  suggestedId,
  unit,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const textPrimary = String(useCSSVariable('--color-text-primary'));
  const [moreOpen, setMoreOpen] = useState(false);
  const unitLabel = plateUnitLabel(t, unit);
  const { segments, hasMore } = pickerBars(bars, selectedId, suggestedId);
  const label = (bar: PlateBar) =>
    `${barLabel(t, bar)} ${formatPlateWeight(bar.weight)} ${unitLabel}`;

  return (
    <View className="gap-2">
      <View
        accessibilityRole="radiogroup"
        className="flex-row gap-1 rounded-3xl bg-surface p-1"
      >
        {segments.map((bar) => {
          const selected = bar.id === selectedId;
          return (
            <Pressable
              key={bar.id}
              onPress={() => onSelect(bar.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={`min-h-11 flex-1 items-center justify-center rounded-full px-2 py-1 ${selected ? 'bg-accent-primary' : ''} active:opacity-70`}
            >
              <Text
                className={`text-center text-[15px] font-bold ${selected ? 'text-white' : 'text-text-secondary'}`}
              >
                {label(bar)}
              </Text>
            </Pressable>
          );
        })}
        {hasMore && (
          <Pressable
            onPress={() => setMoreOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={t('plates.moreBars', {
              defaultValue: 'More bars',
            })}
            accessibilityState={{ expanded: moreOpen }}
            className="h-11 flex-row items-center justify-center gap-1 rounded-full bg-control px-3 active:opacity-70"
          >
            <Text className="text-[15px] font-semibold text-text-primary">
              {t('plates.moreBars', { defaultValue: 'More bars' })}
            </Text>
            <Icon
              name={moreOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={textPrimary}
            />
          </Pressable>
        )}
      </View>
      {moreOpen && (
        <View
          accessibilityRole="radiogroup"
          className="rounded-3xl bg-surface p-1.5"
        >
          {bars.map((bar) => {
            const selected = bar.id === selectedId;
            return (
              <Pressable
                key={bar.id}
                onPress={() => {
                  onSelect(bar.id);
                  setMoreOpen(false);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                className="min-h-11 flex-row items-center justify-between rounded-full px-4 active:opacity-70"
              >
                <Text
                  className={`text-[16px] ${selected ? 'font-bold text-text-primary' : 'text-text-secondary'}`}
                >
                  {label(bar)}
                </Text>
                {selected && (
                  <Icon name="checkmark" size={18} color={textPrimary} />
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
