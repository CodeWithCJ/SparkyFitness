import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Button from '../ui/Button';
import MealLibraryRow from '../MealLibraryRow';
import VerifiedBadge from '../VerifiedBadge';
import FoodResultRow from './FoodResultRow';
import { landingKey } from '../../utils/landingLists';
import { formatServingDescription, formatServingUnit } from '../../utils/foodDetails';
import { OWNERSHIP_FILTER_LABELS, type OwnershipFilter } from '../../utils/shareStatus';
import { mealToFoodInfo } from '../../types/foodInfo';
import type { FoodInfoItem } from '../../types/foodInfo';
import type { ExternalFoodItem } from '../../types/externalFoods';
import type { ExternalProvider } from '../../types/externalProviders';
import type { ResultRow } from './types';

interface OnlineResultRowProps {
  item: ExternalFoodItem;
  badge?: string;
  providerId?: string;
  accentColor: string;
  loadingFoodId: string | null;
  getProviderColor: (providerId?: string | null) => string;
  onSelect: (item: ExternalFoodItem, providerId?: string) => Promise<void>;
}

const OnlineResultRow: React.FC<OnlineResultRowProps> = ({
  item,
  badge,
  providerId,
  accentColor,
  loadingFoodId,
  getProviderColor,
  onSelect,
}) => (
  <TouchableOpacity
    className="px-4 py-2 border-b border-border-subtle"
    activeOpacity={0.7}
    disabled={loadingFoodId !== null}
    onPress={() => {
      void onSelect(item, providerId);
    }}
  >
    <View className="flex-row justify-between items-center">
      <View className="flex-1 mr-3">
        <View className="flex-row items-start gap-1">
          <Text className="text-text-primary text-base font-medium flex-shrink">
            {item.name}
          </Text>
          {item.provider_verified ? <VerifiedBadge size="sm" style={{ marginTop: 2 }} /> : null}
        </View>
        {badge || item.brand ? (
          <View className="flex-row items-center gap-1.5 mt-0.5">
            {badge ? (
              <View className="px-1.5 py-0.5 rounded overflow-hidden">
                <View
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: getProviderColor(providerId),
                    opacity: 0.07,
                  }}
                />
                <Text
                  className="text-xs font-semibold"
                  style={{ color: getProviderColor(providerId) }}
                >
                  {badge}
                </Text>
              </View>
            ) : null}
            {item.brand ? (
              <Text className="text-text-secondary text-sm">{item.brand}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
      <View className="items-end">
        {loadingFoodId === item.id ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <>
            <Text className="text-text-primary text-base font-semibold">
              {item.calories} cal
            </Text>
            <Text className="text-text-secondary text-xs">
              {item.serving_description
                ? formatServingDescription(item.serving_description)
                : `${item.serving_size} ${formatServingUnit(item.serving_unit)}`}
            </Text>
          </>
        )}
      </View>
    </View>
  </TouchableOpacity>
);

interface ShowAllProviderRowProps {
  provider: ExternalProvider;
  count: number;
  accentColor: string;
  onSelectProvider: (providerId: string) => void;
}

// "Show all N <provider> results" → switch into single-provider mode for that
// provider, which shows the full paginated list.
const ShowAllProviderRow: React.FC<ShowAllProviderRowProps> = ({
  provider,
  count,
  accentColor,
  onSelectProvider,
}) => (
  <TouchableOpacity
    className="px-4 py-3 border-b border-border-subtle"
    activeOpacity={0.7}
    onPress={() => onSelectProvider(provider.id)}
  >
    <Text className="text-sm font-medium" style={{ color: accentColor }}>
      Show all {count} {provider.provider_name} results
    </Text>
  </TouchableOpacity>
);

interface ShowAllLocalRowProps {
  section: 'foods' | 'meals';
  count: number;
  accentColor: string;
  onShowAll: (section: 'foods' | 'meals') => void;
}

const ShowAllLocalRow: React.FC<ShowAllLocalRowProps> = ({
  section,
  count,
  accentColor,
  onShowAll,
}) => (
  <TouchableOpacity
    className="px-4 py-3 border-b border-border-subtle"
    activeOpacity={0.7}
    onPress={() => onShowAll(section)}
  >
    <Text className="text-sm font-medium" style={{ color: accentColor }}>
      Show all {count} {section === 'foods' ? 'foods' : 'meals'}
    </Text>
  </TouchableOpacity>
);

const ProviderSkeletonRow: React.FC<{ textMuted: string }> = ({ textMuted }) => (
  <View className="px-4 py-3 gap-2">
    {[0.8, 0.6, 0.7].map((w, i) => (
      <View
        key={i}
        className="h-4 rounded"
        style={{
          width: `${w * 100}%`,
          backgroundColor: textMuted,
          opacity: 0.15,
        }}
      />
    ))}
  </View>
);

interface LocalStatusRowProps {
  pending: boolean;
  isMealBuilderMode: boolean;
  accentColor: string;
  ownershipFilter: OwnershipFilter;
  onResetOwnershipFilter: () => void;
}

const LocalStatusRow: React.FC<LocalStatusRowProps> = ({
  pending,
  isMealBuilderMode,
  accentColor,
  ownershipFilter,
  onResetOwnershipFilter,
}) => {
  const isFiltered = ownershipFilter !== 'all';
  const baseMessage = isMealBuilderMode
    ? 'No saved foods found'
    : 'No saved foods or meals found';
  // A persisted non-default filter can empty the local sections; naming the
  // filter and offering the reset keeps that from reading as missing data.
  const message = isFiltered
    ? `${baseMessage} in ${OWNERSHIP_FILTER_LABELS[ownershipFilter]}`
    : baseMessage;
  return (
    <View className="px-4 py-6 items-center justify-center">
      <View
        className="items-center"
        style={{ opacity: pending ? 0 : 1 }}
        pointerEvents={pending ? 'none' : 'auto'}
        importantForAccessibility={pending ? 'no-hide-descendants' : 'yes'}
        accessibilityElementsHidden={pending}
      >
        <Text className="text-text-secondary text-base text-center">
          {message}
        </Text>
        {isFiltered ? (
          <Button
            variant="secondary"
            onPress={onResetOwnershipFilter}
            className="mt-3 px-5"
          >
            Show All
          </Button>
        ) : null}
      </View>
      {pending ? (
        <View
          className="absolute inset-0 items-center justify-center"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={
            isMealBuilderMode
              ? 'Searching saved foods'
              : 'Searching saved foods and meals'
          }
        >
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      ) : null}
    </View>
  );
};

interface FoodSearchResultRowProps {
  row: ResultRow;
  profileId?: string;
  favoriteKeys: Set<string>;
  favoriteGold: string;
  accentColor: string;
  textMuted: string;
  loadingFoodId: string | null;
  isMealBuilderMode: boolean;
  ownershipFilter: OwnershipFilter;
  onResetOwnershipFilter: () => void;
  getProviderColor: (providerId?: string | null) => string;
  onSelectFood: (item: FoodInfoItem) => void;
  onSelectOnlineFood: (item: ExternalFoodItem, providerId?: string) => Promise<void>;
  onSelectProvider: (providerId: string) => void;
  onShowAllLocal: (section: 'foods' | 'meals') => void;
}

const FoodSearchResultRow: React.FC<FoodSearchResultRowProps> = ({
  row,
  profileId,
  favoriteKeys,
  favoriteGold,
  accentColor,
  textMuted,
  loadingFoodId,
  isMealBuilderMode,
  ownershipFilter,
  onResetOwnershipFilter,
  getProviderColor,
  onSelectFood,
  onSelectOnlineFood,
  onSelectProvider,
  onShowAllLocal,
}) => {
  switch (row.type) {
    case 'food':
      return (
        <FoodResultRow
          item={row.food}
          profileId={profileId}
          isFavorite={favoriteKeys.has(landingKey('food', row.food.id))}
          favoriteGold={favoriteGold}
          onSelect={onSelectFood}
        />
      );
    case 'meal':
      return (
        <MealLibraryRow
          meal={row.meal}
          showDivider
          isFavorite={favoriteKeys.has(landingKey('meal', row.meal.id))}
          onPress={() => onSelectFood(mealToFoodInfo(row.meal))}
        />
      );
    case 'online':
      return (
        <OnlineResultRow
          item={row.online}
          providerId={row.providerId}
          accentColor={accentColor}
          loadingFoodId={loadingFoodId}
          getProviderColor={getProviderColor}
          onSelect={onSelectOnlineFood}
        />
      );
    case 'online-top':
      return (
        <OnlineResultRow
          item={row.online}
          badge={row.providerName}
          providerId={row.providerId}
          accentColor={accentColor}
          loadingFoodId={loadingFoodId}
          getProviderColor={getProviderColor}
          onSelect={onSelectOnlineFood}
        />
      );
    case 'show-all':
      return (
        <ShowAllProviderRow
          provider={row.provider}
          count={row.count}
          accentColor={accentColor}
          onSelectProvider={onSelectProvider}
        />
      );
    case 'show-all-local':
      return (
        <ShowAllLocalRow
          section={row.section}
          count={row.count}
          accentColor={accentColor}
          onShowAll={onShowAllLocal}
        />
      );
    case 'provider-skeleton':
      return <ProviderSkeletonRow textMuted={textMuted} />;
    case 'local-status':
      return (
        <LocalStatusRow
          pending={row.pending}
          isMealBuilderMode={isMealBuilderMode}
          accentColor={accentColor}
          ownershipFilter={ownershipFilter}
          onResetOwnershipFilter={onResetOwnershipFilter}
        />
      );
  }
};

export default FoodSearchResultRow;
