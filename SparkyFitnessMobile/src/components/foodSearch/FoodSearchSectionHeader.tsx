import React from 'react';
import { View, Text, Pressable, ActivityIndicator, Keyboard } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from '../Icon';
import BottomSheetPicker from '../BottomSheetPicker';
import type { PickerOption } from '../BottomSheetPicker';
import type { ResultSection } from './types';

export const SectionTitleHeader: React.FC<{ title: string }> = ({ title }) => (
  <View className="px-4 py-1 bg-background">
    <Text className="text-text-muted text-xs font-bold uppercase">{title}</Text>
  </View>
);

interface FoodSearchSectionHeaderProps {
  section: ResultSection;
  providerOptions: PickerOption<string>[];
  selectedProvider: string | null;
  selectedProviderName: string;
  isAllProviders: boolean;
  anyProviderLoading: boolean;
  isOnlineSearching: boolean;
  expandedProviders: Set<string>;
  getProviderColor: (providerId?: string | null) => string;
  accentColor: string;
  textMuted: string;
  textSecondary: string;
  onSelectProvider: (providerId: string) => void;
  onToggleProvider: (providerId: string) => void;
}

const FoodSearchSectionHeader: React.FC<FoodSearchSectionHeaderProps> = ({
  section,
  providerOptions,
  selectedProvider,
  selectedProviderName,
  isAllProviders,
  anyProviderLoading,
  isOnlineSearching,
  expandedProviders,
  getProviderColor,
  accentColor,
  textMuted,
  textSecondary,
  onSelectProvider,
  onToggleProvider,
}) => {
  const { t } = useTranslation();
  if (!section.title) return null;

  // The External Results / Top Matches header doubles as the source switcher:
  // a single provider, or "All Providers" for the aggregated view. The current
  // value is shown in the accent colour with a double-arrow selector icon so it
  // reads as a switchable control; the icon becomes a spinner while loading.
  if (section.kind === 'online' || section.kind === 'online-top') {
    const canSwitch = providerOptions.length > 1;
    const label =
      section.kind === 'online-top'
        ? t('foodMealScreens.topMatches')
        : t('foodMealScreens.onlineResults');
    const value = isAllProviders ? t('foodMealScreens.allSources') : selectedProviderName;
    const loading = isAllProviders ? anyProviderLoading : isOnlineSearching;
    const header = (
      <View className="px-4 py-1 bg-background flex-row items-center justify-between">
        <Text className="text-text-muted text-xs font-bold uppercase">
          {label}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text
            className="text-sm font-bold"
            style={{ color: canSwitch ? accentColor : textSecondary }}
          >
            {value}
          </Text>
          {loading ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : canSwitch ? (
            <Icon name="chevron-down" size={16} color={accentColor} />
          ) : null}
        </View>
      </View>
    );
    if (!canSwitch) return header;
    return (
      <BottomSheetPicker
        value={selectedProvider ?? ''}
        options={providerOptions}
        onSelect={onSelectProvider}
        title={t('foodMealScreens.onlineProvider')}
        renderTrigger={({ onPress }) => (
          <Pressable
            onPress={() => {
              // Drop the search keyboard first so the sheet isn't hidden
              // behind it as it animates up.
              Keyboard.dismiss();
              onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('foodMealScreens.sourceChange', { source: value })}
          >
            {header}
          </Pressable>
        )}
      />
    );
  }

  // By Source: a tappable accordion header per provider, with a result-count
  // badge and a per-provider loading spinner.
  if (section.kind === 'online-provider' && section.provider) {
    const provider = section.provider;
    const expanded = expandedProviders.has(provider.id);
    const color = getProviderColor(provider.id);
    const loading = !!section.providerLoading;
    const errored = !!section.providerError && !loading;
    const count = section.count ?? 0;
    const empty = !loading && !errored && count === 0;
    const expandable = !loading && !errored && count > 0;
    const onPress = errored
      ? section.onRetry
      : expandable
        ? () => onToggleProvider(provider.id)
        : undefined;
    return (
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        className="px-4 py-2.5 bg-background flex-row items-center justify-between border-t border-border-subtle"
        accessibilityRole="button"
        accessibilityLabel={
          errored
            ? t('foodSearchUi.providerCouldNotLoad', { provider: provider.provider_name })
            : empty
              ? t('foodSearchUi.providerNoResults', { provider: provider.provider_name })
              : expandable
                ? expanded
                  ? t('foodSearchUi.providerResultsCollapse', {
                      provider: provider.provider_name,
                      count,
                    })
                  : t('foodSearchUi.providerResultsExpand', {
                      provider: provider.provider_name,
                      count,
                    })
                : provider.provider_name
        }
      >
        <View className="flex-row items-center gap-2">
          <View
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <Text className="text-text-primary text-base font-semibold">
            {provider.provider_name}
          </Text>
          {expandable ? (
            <View className="px-1.5 py-0.5 rounded-full bg-surface">
              <Text className="text-text-secondary text-xs">{count}</Text>
            </View>
          ) : null}
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={textMuted} />
        ) : errored ? (
          <View className="flex-row items-center gap-1">
            <Text className="text-text-muted text-xs">{t('foodSearchUi.couldNotLoad')}</Text>
            <Icon name="sync" size={14} color={textMuted} />
          </View>
        ) : empty ? (
          <Text className="text-text-muted text-xs">{t('foodSearchUi.noResults')}</Text>
        ) : (
          <Icon
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={textMuted}
          />
        )}
      </Pressable>
    );
  }

  return <SectionTitleHeader title={section.title} />;
};

export default FoodSearchSectionHeader;
