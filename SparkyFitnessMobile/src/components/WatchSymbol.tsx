import React from 'react';
import { Platform, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

interface WatchSymbolProps {
  /** An SF Symbol name from `COMPLICATION_ICONS`: the watch draws it by name. */
  name: string;
  size: number;
  color: string;
}

/**
 * A watch complication's SF Symbol. The icons are the watch's own, so unlike
 * `Icon` there is no semantic name to map and no Ionicons stand-in: where SF
 * Symbols do not exist the slot stays empty (Apple Watch complications are
 * iOS-only, so only the editor on an iPhone ever draws one).
 */
const WatchSymbol: React.FC<WatchSymbolProps> = ({ name, size, color }) => {
  if (Platform.OS !== 'ios') {
    return <View style={{ width: size, height: size }} />;
  }
  return (
    <SymbolView
      name={name as SymbolViewProps['name']}
      size={size}
      tintColor={color}
    />
  );
};

export default WatchSymbol;
