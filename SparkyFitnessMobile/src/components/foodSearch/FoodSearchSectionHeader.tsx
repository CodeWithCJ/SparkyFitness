import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, ActivityIndicator, Keyboard } from 'react-native';
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
      section.kind === 'online-top' ? t('foodSearch.sections.topMatches', { defaultValue: 'Top Matches' }) : t('foodSearch.sections.onlineResults', { defaultValue: 'Online Results' });
    const value = isAllProviders ? t('foodSearch.menu.allSources', { defaultValue: 'All Sources' }) : selectedProviderName;
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
        title={t('foodSearch.pickers.onlineProvider', { defaultValue: 'Online provider' })}
        renderTrigger={({ onPress }) => (
          <Pressable
            onPress={() => {
              // Drop the search keyboard first so the sheet isn't hidden
              // behind it as it animates up.
              Keyboard.dismiss();
              onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('foodSearch.accessibility.sourceChange', { defaultValue: 'Source {{source}}, tap to change', source: value })}
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
            ? t('foodSearch.accessibility.providerError', { defaultValue: '{{provider}}, could not load, tap to retry', provider: provider.provider_name })
            : empty
              ? t('foodSearch.accessibility.providerNoResults', { defaultValue: '{{provider}}, no results', provider: provider.provider_name })
              : expandable
                ? t('foodSearch.accessibility.providerExpand', { defaultValue: '{{provider}}, {{count}} results, tap to {{action}}', provider: provider.provider_name, count, action: expanded ? t('common.collapse', { defaultValue: 'collapse' }) : t('common.expand', { defaultValue: 'expand' }) })
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
            <Text className="text-text-muted text-xs">{t('foodSearch.states.couldNotLoad', { defaultValue: "Couldn't load" })}</Text>
            <Icon name="sync" size={14} color={textMuted} />
          </View>
        ) : empty ? (
          <Text className="text-text-muted text-xs">{t('foodSearch.states.noResults', { defaultValue: 'No results' })}</Text>
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
