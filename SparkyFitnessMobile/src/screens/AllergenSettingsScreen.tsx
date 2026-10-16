import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useAllergenPreferenceMutations,
  useAllergenPreferences,
  useSyncAllergens,
} from '../hooks/useAllergenPreferences';
import {
  COMMON_ALLERGENS,
  localizeAllergen,
  normalizeAllergen,
} from '../utils/allergens';
import type { RootStackScreenProps } from '../types/navigation';

type AllergenSettingsScreenProps = RootStackScreenProps<'AllergenSettings'>;

const AllergenSettingsScreen: React.FC<AllergenSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [mutedColor] = useCSSVariable(['--color-text-muted']) as [string];
  const { preferences } = useAllergenPreferences();
  const { add, remove } = useAllergenPreferenceMutations();
  const syncAllergens = useSyncAllergens();
  const [customAllergen, setCustomAllergen] = useState('');

  const tracked = new Set(
    (preferences ?? []).map((p) => normalizeAllergen(p.allergen_name))
  );

  const handleAdd = useCallback(
    (name: string) => {
      const normalized = normalizeAllergen(name);
      if (!normalized) return;
      const alreadyTracked = (preferences ?? []).some(
        (p) => normalizeAllergen(p.allergen_name) === normalized
      );
      if (alreadyTracked) {
        Toast.show({
          type: 'info',
          text1: t('allergenSettings.alreadyAdded', {
            defaultValue: 'Already added',
          }),
          text2: t('allergenSettings.alreadyAddedDescription', {
            defaultValue: '{{name}} is already in your list.',
            name: normalized,
          }),
        });
        return;
      }
      add.mutate(normalized, { onSuccess: () => setCustomAllergen('') });
    },
    [add, t, preferences]
  );

  const header = useScreenHeader({
    title: t('allergenSettings.title', { defaultValue: 'Allergens' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('allergenSettings.description', {
            defaultValue:
              'Add the allergens you want to be warned about. When a food contains one of these, a warning badge appears on foods and diary entries.',
          })}
        </Text>

        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-3">
            {t('allergenSettings.common', { defaultValue: 'Common allergens' })}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {COMMON_ALLERGENS.map((allergen) => {
              const already = tracked.has(allergen);
              return (
                <Pressable
                  key={allergen}
                  disabled={already}
                  onPress={() => handleAdd(allergen)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: already }}
                  className={`rounded-full border border-border-subtle px-3 py-1.5 ${already ? 'opacity-40' : ''}`}
                >
                  <Text className="text-sm text-text-primary capitalize">
                    {localizeAllergen(t, allergen)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="text-sm text-text-secondary mt-4 mb-1">
            {t('allergenSettings.custom', { defaultValue: 'Custom allergen' })}
          </Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              className="flex-1 bg-background rounded-lg px-3 py-2 text-text-primary"
              value={customAllergen}
              onChangeText={setCustomAllergen}
              onSubmitEditing={() => handleAdd(customAllergen)}
              returnKeyType="done"
              autoCapitalize="none"
              placeholder={t('allergenSettings.customPlaceholder', {
                defaultValue: 'e.g., lupin, molluscs…',
              })}
              placeholderTextColor={mutedColor}
              testID="custom-allergen-input"
            />
            <Button
              variant="primary"
              onPress={() => handleAdd(customAllergen)}
              disabled={!customAllergen.trim() || add.isPending}
            >
              {t('common.add', { defaultValue: 'Add' })}
            </Button>
          </View>
        </View>

        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-3">
            {t('allergenSettings.tracked', {
              defaultValue: 'Your tracked allergens',
            })}
          </Text>
          {!preferences || preferences.length === 0 ? (
            <Text className="text-text-secondary text-sm">
              {t('allergenSettings.empty', {
                defaultValue:
                  'No allergens tracked yet. Add some above to get warnings on foods.',
              })}
            </Text>
          ) : (
            preferences.map((pref) => (
              <View
                key={pref.id}
                className="flex-row items-center justify-between py-2"
              >
                <Text className="text-base text-text-primary capitalize">
                  {localizeAllergen(t, pref.allergen_name)}
                </Text>
                <Pressable
                  onPress={() => remove.mutate(pref.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('allergenSettings.remove', {
                    defaultValue: 'Remove {{name}}',
                    name: pref.allergen_name,
                  })}
                >
                  <Icon name="trash" size={20} color={mutedColor} />
                </Pressable>
              </View>
            ))
          )}
        </View>
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-1">
            {t('allergenSettings.sync.title', {
              defaultValue: 'Sync from OpenFoodFacts',
            })}
          </Text>
          <Text className="text-sm text-text-secondary mb-3">
            {t('allergenSettings.sync.description', {
              defaultValue:
                'Fetch allergen data for your saved OpenFoodFacts foods. Only needs to be done once.',
            })}
          </Text>
          <Button
            variant="outline"
            onPress={() => syncAllergens.mutate()}
            disabled={syncAllergens.isPending}
            loading={syncAllergens.isPending}
          >
            {t('allergenSettings.sync.button', {
              defaultValue: 'Sync allergens',
            })}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
};

export default AllergenSettingsScreen;
