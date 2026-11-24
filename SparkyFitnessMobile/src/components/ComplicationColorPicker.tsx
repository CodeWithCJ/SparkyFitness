import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import {
  COMPLICATION_COLORS,
  COMPLICATION_COLOR_HEX,
  COMPLICATION_COLOR_LABELS,
  type ComplicationColor,
} from '../utils/watchComplications';

interface ComplicationColorPickerProps {
  value: ComplicationColor;
  onSelect: (color: ComplicationColor) => void;
  /** Each swatch's test id is `<prefix>-<color>`. */
  testIDPrefix: string;
  size?: number;
}

/** The watch's complication colours as a row of swatches. */
const ComplicationColorPicker: React.FC<ComplicationColorPickerProps> = ({
  value,
  onSelect,
  testIDPrefix,
  size = 40,
}) => {
  const { t } = useTranslation();
  const [accent, border] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-strong',
  ]) as [string, string];
  return (
    <View className="flex-row flex-wrap gap-3">
      {COMPLICATION_COLORS.map((color) => {
        const selected = value === color;
        return (
          <Pressable
            key={color}
            testID={`${testIDPrefix}-${color}`}
            accessibilityRole="button"
            accessibilityLabel={COMPLICATION_COLOR_LABELS[color](t)}
            accessibilityState={{ selected }}
            onPress={() => onSelect(color)}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: COMPLICATION_COLOR_HEX[color],
              borderWidth: selected ? 3 : 1,
              borderColor: selected ? accent : border,
            }}
          />
        );
      })}
    </View>
  );
};

export default ComplicationColorPicker;
