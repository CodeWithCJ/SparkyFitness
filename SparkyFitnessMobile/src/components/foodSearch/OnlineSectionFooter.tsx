import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ActivityIndicator } from 'react-native';
import Button from '../ui/Button';

interface OnlineSectionFooterProps {
  isOnlineSearching: boolean;
  visibleOnlineResultCount: number;
  isFetchNextPageError: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  selectedProviderName: string;
  accentColor: string;
  onFetchNextPage: () => void;
}

const OnlineSectionFooter: React.FC<OnlineSectionFooterProps> = ({
  isOnlineSearching,
  visibleOnlineResultCount,
  isFetchNextPageError,
  isFetchingNextPage,
  hasNextPage,
  selectedProviderName,
  accentColor,
  onFetchNextPage,
}) => {
  const { t } = useTranslation();
  if (isOnlineSearching && visibleOnlineResultCount === 0) {
    return (
      <View className="py-4 items-center">
        <ActivityIndicator size="small" color={accentColor} />
      </View>
    );
  }
  if (isFetchNextPageError) {
    return (
      <Button
        variant="ghost"
        onPress={() => onFetchNextPage()}
        className="py-3"
        textClassName="text-sm"
      >
        {t('foodSearch.actions.loadMoreFailed', { defaultValue: 'Failed to load more. Tap to retry' })}
      </Button>
    );
  }
  if (isFetchingNextPage) {
    return (
      <View className="py-3 items-center">
        <ActivityIndicator size="small" color={accentColor} />
      </View>
    );
  }
  if (hasNextPage) {
    return (
      <Button
        variant="ghost"
        onPress={() => onFetchNextPage()}
        className="py-4 mb-4"
        textClassName="text-sm"
      >
        {t('foodSearch.actions.loadMore', { defaultValue: 'Load More' })}
      </Button>
    );
  }
  if (visibleOnlineResultCount === 0 && !isOnlineSearching) {
    return (
      <View className="px-4 py-4">
        <Text className="text-text-secondary text-sm text-center">
          {t('foodSearch.states.noOnlineResultsFrom', { defaultValue: 'No online results from {{provider}}', provider: selectedProviderName })}
        </Text>
      </View>
    );
  }
  return null;
};

export default OnlineSectionFooter;
