import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ShoeResponse } from '@workspace/shared';

import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { useShoeMutations, useShoes } from '../hooks/useShoes';
import { formatLocalizedNumber } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { kmToMiles } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'Shoes'>;

const ShoeCard: React.FC<{
  shoe: ShoeResponse;
  distanceUnit: 'km' | 'miles';
  onPress: () => void;
  onRetire: () => void;
  retiring?: boolean;
}> = ({ shoe, distanceUnit, onPress, onRetire, retiring }) => {
  const { t } = useTranslation();
  const unit = distanceUnit === 'miles' ? 'mi' : 'km';
  const show = (km: number) =>
    formatLocalizedNumber(distanceUnit === 'miles' ? kmToMiles(km) : km, {
      maximumFractionDigits: 1,
    });
  const percent = Math.min(
    100,
    (shoe.total_distance_km / shoe.retirement_distance_km) * 100
  );
  const subtitle = [shoe.brand, shoe.model].filter(Boolean).join(' ');
  const title = shoe.nickname || shoe.name;
  const status =
    shoe.status === 'retired'
      ? t('shoes.retired', { defaultValue: 'Retired' })
      : shoe.is_worn_out
        ? t('shoes.wornOut', { defaultValue: 'Worn out' })
        : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className={`bg-surface rounded-xl p-4 mb-3 shadow-sm ${
        shoe.status === 'retired' ? 'opacity-60' : ''
      }`}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text
            className="text-base font-semibold text-text-primary"
            numberOfLines={1}
          >
            {title}
            {shoe.is_default ? '  ★' : ''}
          </Text>
          {subtitle || shoe.nickname ? (
            <Text className="text-sm text-text-secondary" numberOfLines={1}>
              {shoe.nickname
                ? [shoe.name, subtitle].filter(Boolean).join(' · ')
                : subtitle}
            </Text>
          ) : null}
        </View>
        {status ? (
          <Text
            className={`text-xs font-semibold ${
              shoe.status === 'retired' ? 'text-text-secondary' : 'text-red-500'
            }`}
          >
            {status}
          </Text>
        ) : null}
      </View>
      <View className="flex-row justify-between mt-3">
        <Text className="text-sm font-medium text-text-primary">
          {show(shoe.total_distance_km)} {unit}
        </Text>
        <Text className="text-sm text-text-secondary">
          {t('shoes.ofLimit', {
            defaultValue: 'of {{limit}} {{unit}}',
            limit: show(shoe.retirement_distance_km),
            unit,
          })}
        </Text>
      </View>
      <View className="h-2 rounded-full bg-border mt-1 overflow-hidden">
        <View
          className={`h-2 rounded-full ${
            shoe.is_worn_out ? 'bg-red-500' : 'bg-accent-primary'
          }`}
          style={{ width: `${percent}%` }}
        />
      </View>
      {shoe.status === 'active' && shoe.is_worn_out ? (
        <View className="flex-row items-center justify-between mt-3 rounded-lg bg-red-500/10 p-2">
          <Text className="flex-1 pr-2 text-sm text-text-primary">
            {t('shoes.retirePrompt', {
              defaultValue: 'This pair has reached its limit. Retire it?',
            })}
          </Text>
          <Pressable
            onPress={onRetire}
            disabled={retiring}
            accessibilityState={{ disabled: retiring }}
            accessibilityRole="button"
            accessibilityLabel={t('shoes.retire', { defaultValue: 'Retire' })}
            className={`rounded-lg bg-red-500 px-3 py-1.5 ${retiring ? 'opacity-50' : ''}`}
          >
            <Text className="text-sm font-semibold text-white">
              {t('shoes.retire', { defaultValue: 'Retire' })}
            </Text>
          </Pressable>
        </View>
      ) : null}
      <Text className="text-xs text-text-secondary mt-2">
        {t('shoes.runCount', {
          count: shoe.run_count,
          defaultValue: '{{count}} runs',
          defaultValue_one: '{{count}} run',
          defaultValue_other: '{{count}} runs',
        })}
        {shoe.last_used_date
          ? ` · ${t('shoes.lastUsed', {
              defaultValue: 'last used {{date}}',
              date: shoe.last_used_date,
            })}`
          : ''}
      </Text>
    </Pressable>
  );
};

const ShoesScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { shoes, isLoading, isError, refetch } = useShoes();
  const { updateMutation } = useShoeMutations();

  const header = useScreenHeader({
    title: t('shoes.title', { defaultValue: 'Shoes' }),
    left: { kind: 'back' },
    right: [
      {
        kind: 'primary',
        label: t('shoes.add', { defaultValue: 'Add' }),
        onPress: () => navigation.navigate('ShoeForm', {}),
      },
    ],
  });

  const active = shoes.filter((shoe) => shoe.status === 'active');
  const retired = shoes.filter((shoe) => shoe.status === 'retired');
  const renderList = (list: ShoeResponse[]) =>
    list.map((shoe) => (
      <ShoeCard
        key={shoe.id}
        shoe={shoe}
        distanceUnit={distanceUnit}
        onPress={() => navigation.navigate('ShoeForm', { shoeId: shoe.id })}
        retiring={updateMutation.isPending}
        onRetire={() => {
          if (updateMutation.isPending) return;
          updateMutation.mutate({ id: shoe.id, data: { status: 'retired' } });
        }}
      />
    ));

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isError ? (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('shoes.loadFailed', {
            defaultValue: 'Could not load your shoes.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : shoes.length === 0 ? (
        <StatusView
          icon="exercise-running-filled"
          title={t('shoes.empty', {
            defaultValue: 'No shoes yet',
          })}
          subtitle={t('shoes.emptyHint', {
            defaultValue:
              'Add a pair, then pick it on a run to start counting its mileage.',
          })}
          action={{
            label: t('shoes.addShoe', { defaultValue: 'Add shoe' }),
            onPress: () => navigation.navigate('ShoeForm', {}),
          }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24 + activeWorkoutBarPadding,
          }}
        >
          {renderList(active)}
          {retired.length > 0 && (
            <>
              <Text className="text-sm font-semibold text-text-secondary mt-2 mb-2">
                {t('shoes.retiredSection', { defaultValue: 'Retired' })}
              </Text>
              {renderList(retired)}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
};

export default ShoesScreen;
