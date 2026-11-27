import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import type { ScreenHeaderConfig } from '../hooks/useScreenHeader';
import Icon from './Icon';
import Button from './ui/Button';

interface DiaryEntrySelectionBarProps {
  selectedCount: number;
  isPending: boolean;
  cancelSelection: () => void;
  confirmDelete: () => void;
  openMove: () => void;
}

export function createDiaryEntrySelectionHeader(
  t: TFunction,
  {
    selectedCount,
    isPending,
    cancelSelection,
    confirmDelete,
    openMove,
  }: DiaryEntrySelectionBarProps
) {
  const disabled = selectedCount === 0 || isPending;
  return {
    title: t('diarySelection.count', {
      count: selectedCount,
      defaultValue: '{{count}} selected',
    }),
    left: {
      kind: 'dismiss',
      accessibilityLabel: t('common.cancel', { defaultValue: 'Cancel' }),
      identifier: 'diary-selection-cancel',
      onPress: cancelSelection,
      disabled: isPending,
    },
    right: [
      {
        kind: 'icon',
        sfSymbol: 'arrow.left.arrow.right',
        ionicon: 'swap-horizontal-outline',
        accessibilityLabel: t('diarySelection.move', { defaultValue: 'Move' }),
        identifier: 'diary-selection-move',
        onPress: () => openMove(),
        disabled,
      },
      {
        kind: 'icon',
        sfSymbol: 'trash',
        ionicon: 'trash-outline',
        accessibilityLabel: t('common.delete', { defaultValue: 'Delete' }),
        identifier: 'diary-selection-delete',
        onPress: confirmDelete,
        disabled,
      },
    ],
  } satisfies ScreenHeaderConfig;
}

export default function DiaryEntrySelectionBar(
  props: DiaryEntrySelectionBarProps
) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const textColor = useCSSVariable('--color-text-primary') as string;
  const {
    title,
    left,
    right: [move, remove],
  } = createDiaryEntrySelectionHeader(t, props);
  return (
    <View style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        <Pressable
          className="h-11 w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={left.accessibilityLabel}
          onPress={left.onPress}
          disabled={left.disabled}
        >
          <Icon name="close" color={textColor} size={24} />
        </Pressable>
        <Text className="flex-1 text-sm font-semibold text-text-primary">
          {title}
        </Text>
        <Button variant="ghost" onPress={move.onPress} disabled={move.disabled}>
          {move.accessibilityLabel}
        </Button>
        <Button
          variant="ghost"
          onPress={remove.onPress}
          disabled={remove.disabled}
        >
          {remove.accessibilityLabel}
        </Button>
      </View>
    </View>
  );
}
