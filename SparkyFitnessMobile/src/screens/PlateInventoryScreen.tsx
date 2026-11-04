import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  PLATE_PAIRS_MAX,
  presetInventory,
  savePlateInventoryBodySchema,
  type BarKind,
  type PlateInventoryConfig,
  type PlateUnit,
} from '@workspace/shared';

import FormInput from '../components/FormInput';
import StatusView from '../components/StatusView';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import {
  usePlateInventory,
  usePlateInventoryMutations,
} from '../hooks/usePlateInventory';
import { addLog } from '../services/LogService';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { barLabel } from '../utils/plateFormat';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'PlateInventory'>;

interface PlateRow {
  key: string;
  weight: string;
  pairs: number;
}
interface BarRow {
  id: string;
  name: string;
  kind: BarKind;
  weight: string;
}
interface Draft {
  unit: PlateUnit;
  plates: PlateRow[];
  bars: BarRow[];
  collarsEnabled: boolean;
  collarWeight: string;
}

let rowCounter = 0;
const nextKey = (prefix: string) => `${prefix}-${Date.now()}-${rowCounter++}`;

const toDraft = (config: PlateInventoryConfig): Draft => ({
  unit: config.unit,
  plates: config.plates.map((p) => ({
    key: nextKey('plate'),
    weight: String(Number(p.weight.toFixed(3))),
    pairs: p.pairs,
  })),
  bars: config.bars.map((b) => ({
    id: b.id,
    name: b.name ?? '',
    kind: b.kind,
    weight: String(Number(b.weight.toFixed(3))),
  })),
  collarsEnabled: config.collarsEnabled,
  collarWeight: String(Number(config.collarWeight.toFixed(3))),
});

/** Accepts a comma as the decimal mark; blank or junk is NaN. */
const parseWeight = (text: string): number =>
  text.trim() === '' ? Number.NaN : Number(text.replace(',', '.').trim());

const SectionTitle: React.FC<{ title: string }> = ({ title }) => (
  <Text className="text-base font-semibold text-text-primary mb-2">
    {title}
  </Text>
);

type PlateInventoryMutations = ReturnType<typeof usePlateInventoryMutations>;

const PlateInventoryForm: React.FC<{
  initial: PlateInventoryConfig;
  hasSaved: boolean;
  onDone: () => void;
  mutations: PlateInventoryMutations;
  /** The header's Save button calls whatever the form last put here. */
  saveRef: React.MutableRefObject<(() => void) | null>;
}> = ({ initial, hasSaved, onDone, mutations, saveRef }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { saveMutation, resetMutation } = mutations;
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [error, setError] = useState<string | null>(null);
  const isBusy = saveMutation.isPending || resetMutation.isPending;

  const patch = (changes: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...changes }));
  const updatePlate = (key: string, changes: Partial<PlateRow>) =>
    patch({
      plates: draft.plates.map((p) =>
        p.key === key ? { ...p, ...changes } : p
      ),
    });
  const updateBar = (id: string, changes: Partial<BarRow>) =>
    patch({
      bars: draft.bars.map((b) => (b.id === id ? { ...b, ...changes } : b)),
    });
  const applyPreset = (unit: PlateUnit) => {
    setDraft(toDraft(presetInventory(unit)));
    setError(null);
  };

  const handleSave = () => {
    const parsed = savePlateInventoryBodySchema.safeParse({
      weight_unit: draft.unit,
      collars_enabled: draft.collarsEnabled,
      bars: draft.bars.map((b) => ({
        id: b.id,
        name: b.name.trim() === '' ? null : b.name.trim(),
        kind: b.kind,
        weight: parseWeight(b.weight),
      })),
      plates: draft.plates.map((p) => ({
        weight: parseWeight(p.weight),
        pairs: p.pairs,
      })),
      collar_weight: draft.collarWeight.trim()
        ? parseWeight(draft.collarWeight)
        : 0,
    });
    if (!parsed.success) {
      setError(
        t('plates.invalid', {
          defaultValue:
            'Check the weights and pairs: weights have at most 3 decimals, each plate size is listed once, and pairs are whole numbers up to 20.',
        })
      );
      return;
    }
    setError(null);
    saveMutation.mutate(
      {
        ...parsed.data,
        plates: [...parsed.data.plates].sort((a, b) => b.weight - a.weight),
      },
      {
        onSuccess: onDone,
        onError: (e) => {
          addLog('Failed to save plate inventory', 'ERROR', [String(e)]);
          Toast.show({
            type: 'error',
            text1: t('plates.saveFailed', {
              defaultValue: 'Failed to save plates and bars',
            }),
            text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
          });
        },
      }
    );
  };

  useEffect(() => {
    saveRef.current = handleSave;
    return () => {
      saveRef.current = null;
    };
  });

  const handleReset = () => {
    Alert.alert(
      t('plates.resetTitle', { defaultValue: 'Reset to standard?' }),
      t('plates.resetDescription', {
        defaultValue:
          'Your saved plates and bars are removed and the standard set is used again.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('plates.resetToStandard', {
            defaultValue: 'Reset to standard',
          }),
          style: 'destructive',
          onPress: () =>
            resetMutation.mutate(undefined, {
              onSuccess: onDone,
              onError: (e) => {
                addLog('Failed to reset plate inventory', 'ERROR', [String(e)]);
                Toast.show({
                  type: 'error',
                  text1: t('plates.resetFailed', {
                    defaultValue: 'Failed to reset plates and bars',
                  }),
                });
              },
            }),
        },
      ]
    );
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
        <SectionTitle
          title={t('plates.startFrom', { defaultValue: 'Start from' })}
        />
        <View className="flex-row gap-2">
          <Button
            variant={draft.unit === 'kg' ? 'primary' : 'outline'}
            onPress={() => applyPreset('kg')}
          >
            {t('plates.useKgPlates', { defaultValue: 'Use kg plates' })}
          </Button>
          <Button
            variant={draft.unit === 'lbs' ? 'primary' : 'outline'}
            onPress={() => applyPreset('lbs')}
          >
            {t('plates.useLbPlates', { defaultValue: 'Use lb plates' })}
          </Button>
        </View>
        <Text className="text-xs text-text-muted mt-2">
          {t('plates.presetHint', {
            defaultValue:
              'Starts from the standard set; you can edit it below.',
          })}
        </Text>
      </View>

      <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
        <SectionTitle
          title={t('plates.platesHeading', {
            defaultValue: 'Plates ({{unit}})',
            unit: draft.unit,
          })}
        />
        {draft.plates.map((plate) => (
          <View key={plate.key} className="flex-row items-center mb-2">
            <View className="flex-1">
              <FormInput
                value={plate.weight}
                onChangeText={(text) =>
                  updatePlate(plate.key, { weight: text })
                }
                keyboardType="decimal-pad"
                maxLength={8}
                accessibilityLabel={t('plates.plateWeight', {
                  defaultValue: 'Weight',
                })}
              />
            </View>
            <Pressable
              onPress={() =>
                updatePlate(plate.key, { pairs: Math.max(0, plate.pairs - 1) })
              }
              accessibilityRole="button"
              accessibilityLabel={t('plates.fewerPairs', {
                defaultValue: 'Fewer pairs of {{weight}}',
                weight: plate.weight,
              })}
              className="w-10 h-10 items-center justify-center"
            >
              <Text className="text-2xl text-text-primary">−</Text>
            </Pressable>
            <Text
              className="w-16 text-center text-base text-text-primary"
              accessibilityLabel={t('plates.pairsCount', {
                defaultValue: '{{count}} pairs',
                count: plate.pairs,
              })}
            >
              {t('plates.pairsShort', {
                defaultValue: '{{count}} pr',
                count: plate.pairs,
              })}
            </Text>
            <Pressable
              onPress={() =>
                updatePlate(plate.key, {
                  pairs: Math.min(PLATE_PAIRS_MAX, plate.pairs + 1),
                })
              }
              accessibilityRole="button"
              accessibilityLabel={t('plates.morePairs', {
                defaultValue: 'More pairs of {{weight}}',
                weight: plate.weight,
              })}
              className="w-10 h-10 items-center justify-center"
            >
              <Text className="text-2xl text-text-primary">+</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                patch({
                  plates: draft.plates.filter((p) => p.key !== plate.key),
                })
              }
              accessibilityRole="button"
              accessibilityLabel={t('plates.removePlate', {
                defaultValue: 'Remove plate {{weight}}',
                weight: plate.weight,
              })}
              className="w-10 h-10 items-center justify-center"
            >
              <Text className="text-lg text-red-500">✕</Text>
            </Pressable>
          </View>
        ))}
        <Button
          variant="outline"
          onPress={() =>
            patch({
              plates: [
                ...draft.plates,
                { key: nextKey('plate'), weight: '', pairs: 1 },
              ],
            })
          }
        >
          {t('plates.addPlate', { defaultValue: 'Add plate' })}
        </Button>
      </View>

      <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
        <SectionTitle
          title={t('plates.barsHeading', {
            defaultValue: 'Bars ({{unit}})',
            unit: draft.unit,
          })}
        />
        {draft.bars.map((bar, index) => {
          const title =
            bar.name.trim() || barLabel(t, { name: null, kind: bar.kind });
          const canRemove = draft.bars.length > 1;
          return (
            <View
              key={bar.id}
              className="border border-border-subtle rounded-xl p-3 mb-3"
              accessibilityLabel={t('plates.barCard', {
                defaultValue: 'Bar {{number}}: {{name}}',
                number: index + 1,
                name: title,
              })}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text
                  className="flex-1 text-base font-semibold text-text-primary"
                  numberOfLines={1}
                >
                  {index + 1}. {title}
                </Text>
                <Pressable
                  disabled={!canRemove}
                  onPress={() =>
                    patch({ bars: draft.bars.filter((b) => b.id !== bar.id) })
                  }
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canRemove }}
                  accessibilityLabel={t('plates.removeBar', {
                    defaultValue: 'Remove bar {{name}}',
                    name: title,
                  })}
                  hitSlop={8}
                >
                  <Text
                    className={`text-sm ${
                      canRemove ? 'text-red-500' : 'text-text-muted'
                    }`}
                  >
                    {t('plates.removeBarShort', { defaultValue: 'Remove' })}
                  </Text>
                </Pressable>
              </View>
              <View className="flex-row">
                <View className="flex-1 mr-2">
                  <Text className="text-xs text-text-muted mb-1">
                    {t('plates.barName', { defaultValue: 'Name' })}
                  </Text>
                  <FormInput
                    value={bar.name}
                    onChangeText={(text) => updateBar(bar.id, { name: text })}
                    maxLength={60}
                    placeholder={barLabel(t, { name: null, kind: bar.kind })}
                    accessibilityLabel={t('plates.barName', {
                      defaultValue: 'Name',
                    })}
                  />
                </View>
                <View style={{ width: 110 }}>
                  <Text className="text-xs text-text-muted mb-1">
                    {t('plates.barWeightUnit', {
                      defaultValue: 'Weight ({{unit}})',
                      unit: draft.unit,
                    })}
                  </Text>
                  <FormInput
                    value={bar.weight}
                    onChangeText={(text) => updateBar(bar.id, { weight: text })}
                    keyboardType="decimal-pad"
                    maxLength={8}
                    accessibilityLabel={t('plates.barWeightLabel', {
                      defaultValue: 'Bar weight',
                    })}
                  />
                </View>
              </View>
            </View>
          );
        })}
        <Button
          variant="outline"
          onPress={() =>
            patch({
              bars: [
                ...draft.bars,
                { id: nextKey('bar'), name: '', kind: 'other', weight: '' },
              ],
            })
          }
        >
          {t('plates.addBar', { defaultValue: 'Add bar' })}
        </Button>
      </View>

      <SettingsRowGroup>
        <SettingsRow
          title={t('plates.collarsCount', { defaultValue: 'Collars count' })}
          subtitle={t('plates.collarsHint', {
            defaultValue: 'Add the weight of the collars to each load.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={draft.collarsEnabled}
              onValueChange={(value) => patch({ collarsEnabled: value })}
              accessibilityLabel={t('plates.collarsCount', {
                defaultValue: 'Collars count',
              })}
            />
          }
        />
      </SettingsRowGroup>
      {draft.collarsEnabled && (
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <SectionTitle
            title={t('plates.collarWeight', {
              defaultValue: 'Weight of one collar ({{unit}})',
              unit: draft.unit,
            })}
          />
          <FormInput
            value={draft.collarWeight}
            onChangeText={(text) => patch({ collarWeight: text })}
            keyboardType="decimal-pad"
            maxLength={8}
            accessibilityLabel={t('plates.collarWeight', {
              defaultValue: 'Weight of one collar ({{unit}})',
              unit: draft.unit,
            })}
          />
        </View>
      )}

      {error && <Text className="text-sm text-red-500 mb-3">{error}</Text>}

      {hasSaved && (
        <View className="mt-3">
          <Button variant="outline" onPress={handleReset} disabled={isBusy}>
            {t('plates.resetToStandard', { defaultValue: 'Reset to standard' })}
          </Button>
        </View>
      )}
    </ScrollView>
  );
};

const PlateInventoryScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const weightUnit: PlateUnit =
    preferences?.default_weight_unit === 'lbs' ? 'lbs' : 'kg';
  const { inventory, hasSaved, isLoading, isError, refetch } =
    usePlateInventory(weightUnit);

  const mutations = usePlateInventoryMutations();
  const saveRef = useRef<(() => void) | null>(null);
  const ready = !isLoading && !isError;

  const header = useScreenHeader({
    title: t('plates.title', { defaultValue: 'Plates & bars' }),
    left: { kind: 'back' },
    right: [
      {
        kind: 'primary',
        label: t('common.save', { defaultValue: 'Save' }),
        onPress: () => saveRef.current?.(),
        busy: mutations.saveMutation.isPending,
        disabled: !ready || mutations.resetMutation.isPending,
        identifier: 'plate-inventory-save',
      },
    ],
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isLoading ? (
        <StatusView loading />
      ) : isError ? (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('plates.loadFailed', {
            defaultValue: 'Could not load your plates and bars.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      ) : (
        <PlateInventoryForm
          key={hasSaved ? 'saved' : 'standard'}
          initial={inventory}
          hasSaved={hasSaved}
          onDone={() => navigation.goBack()}
          mutations={mutations}
          saveRef={saveRef}
        />
      )}
    </View>
  );
};

export default PlateInventoryScreen;
