import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import Button from './ui/Button';

interface DiaryEntrySelectionBarProps {
  selectedCount: number;
  isPending: boolean;
  cancelSelection: () => void;
  confirmDelete: () => void;
  openMove: () => void;
}

export default function DiaryEntrySelectionBar({
  selectedCount,
  isPending,
  cancelSelection,
  confirmDelete,
  openMove,
}: DiaryEntrySelectionBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const textColor = useCSSVariable('--color-text-primary') as string;
  const canEdit = selectedCount > 0 && !isPending;
  return (
    <View style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 border-b border-border px-3 py-2">
        <Pressable
          className="h-11 w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel', { defaultValue: 'Cancel' })}
          onPress={cancelSelection}
          disabled={isPending}
        >
          <Icon name="close" color={textColor} size={24} />
        </Pressable>
        <Text className="flex-1 text-sm font-semibold text-text-primary">
          {t('diarySelection.count', {
            count: selectedCount,
            defaultValue: '{{count}} selected',
          })}
        </Text>
        <Button variant="ghost" onPress={() => openMove()} disabled={!canEdit}>
          {t('diarySelection.move', { defaultValue: 'Move' })}
        </Button>
        <Button variant="ghost" onPress={confirmDelete} disabled={!canEdit}>
          {t('common.delete', { defaultValue: 'Delete' })}
        </Button>
      </View>
    </View>
  );
}
