import React, { useState } from 'react';
import { View, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

interface LibrarySearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  isSearching?: boolean;
}

const LibrarySearchBar: React.FC<LibrarySearchBarProps> = ({
  value,
  onChangeText,
  placeholder,
  isSearching = false,
}) => {
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View className="px-4 pb-3">
      <View
        className="flex-row items-center bg-raised rounded-lg px-3"
        style={{ borderWidth: 1, borderColor: isFocused ? accentColor : 'transparent' }}
      >
        <Icon name="search" size={18} color={textMuted} />
        <View className="flex-1 ml-2">
          <TextInput
            className="text-text-primary"
            style={{ fontSize: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 0 }}
            placeholder={placeholder}
            placeholderTextColor={textMuted}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        {isSearching ? <ActivityIndicator size="small" color={accentColor} /> : null}
      </View>
    </View>
  );
};

export default LibrarySearchBar;
