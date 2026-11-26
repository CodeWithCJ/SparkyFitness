import React from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import WatchSymbol from './WatchSymbol';
import {
  COMPLICATION_COLOR_HEX,
  COMPLICATION_ICONS,
  COMPLICATION_ICON_LABELS,
  type ComplicationColor,
  type ComplicationIcon,
} from '../utils/watchComplications';

interface ComplicationIconPickerProps {
  value: ComplicationIcon;
  /** The icons are drawn in this colour, so the choice looks as it will. */
  color: ComplicationColor;
  onSelect: (icon: ComplicationIcon) => void;
  /** Each icon's test id is `<prefix>-<icon>`. */
  testIDPrefix: string;
}

/** The watch's complication icons as a grid of buttons. */
const ComplicationIconPicker: React.FC<ComplicationIconPickerProps> = ({
  value,
  color,
  onSelect,
  testIDPrefix,
}) => {
  const { t } = useTranslation();
  const [accent, border] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-strong',
  ]) as [string, string];
  return (
    <View className="flex-row flex-wrap gap-3">
      {COMPLICATION_ICONS.map((icon) => {
        const selected = value === icon;
        return (
          <Pressable
            key={icon}
            testID={`${testIDPrefix}-${icon}`}
            accessibilityRole="button"
            accessibilityLabel={COMPLICATION_ICON_LABELS[icon](t)}
            accessibilityState={{ selected }}
            onPress={() => onSelect(icon)}
            className="items-center justify-center rounded-xl bg-watch-face"
            style={{
              width: 44,
              height: 44,
              borderWidth: selected ? 3 : 1,
              borderColor: selected ? accent : border,
            }}
          >
            <WatchSymbol
              name={icon}
              size={22}
              color={COMPLICATION_COLOR_HEX[color]}
            />
          </Pressable>
        );
      })}
    </View>
  );
};

export default ComplicationIconPicker;
