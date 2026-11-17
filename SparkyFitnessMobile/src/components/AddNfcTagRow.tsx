import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

interface AddNfcTagRowProps {
  /** How many tags already log this item, or a hint while there are none. */
  subtitle: string;
  onPress: () => void;
  className?: string;
}

/**
 * The "Add NFC tag" row on a water container, food or saved meal (#941). The
 * caller shows it only on a phone with NFC and opens the tag form pre-filled.
 */
const AddNfcTagRow: React.FC<AddNfcTagRowProps> = ({
  subtitle,
  onPress,
  className = 'mt-6',
}) => {
  const { t } = useTranslation();
  const chevronColor = useCSSVariable('--color-icon-decorative') as string;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center justify-between bg-surface rounded-xl px-4 py-3 shadow-sm ${className}`}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      <View className="flex-1 mr-3">
        <Text className="text-base text-text-primary">
          {t('actionTags.container.add', { defaultValue: 'Add NFC tag' })}
        </Text>
        <Text className="text-sm text-text-secondary mt-0.5">{subtitle}</Text>
      </View>
      <Icon name="chevron-forward" size={20} color={chevronColor} />
    </Pressable>
  );
};

export default AddNfcTagRow;
