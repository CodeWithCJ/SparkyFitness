import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';

interface PaginatedLibraryFooterProps {
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  errorMessage: string;
  onRetry: () => void;
}

const PaginatedLibraryFooter: React.FC<PaginatedLibraryFooterProps> = ({
  isFetchingNextPage,
  isFetchNextPageError,
  errorMessage,
  onRetry,
}) => {
  const accentColor = useCSSVariable('--color-accent-primary') as string;

  if (isFetchingNextPage) {
    return (
      <View className="py-5 items-center">
        <ActivityIndicator size="small" color={accentColor} />
      </View>
    );
  }

  if (isFetchNextPageError) {
    return (
      <View className="px-4 py-4 items-center">
        <Text className="text-text-secondary text-sm text-center mb-3">{errorMessage}</Text>
        <Button variant="secondary" className="px-6" onPress={onRetry}>
          Retry
        </Button>
      </View>
    );
  }

  return null;
};

export default PaginatedLibraryFooter;
