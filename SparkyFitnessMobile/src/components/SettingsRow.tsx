import React, { createContext, useContext } from 'react';
import { View, Text, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon, { type IconName } from './Icon';

const SettingsRowGroupContext = createContext<{ grouped: boolean }>({ grouped: false });

interface SettingsRowGroupProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

export const SettingsRowGroup: React.FC<SettingsRowGroupProps> = ({
  children,
  style,
  className = '',
}) => {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <SettingsRowGroupContext.Provider value={{ grouped: true }}>
      <View className={`bg-surface rounded-xl mb-4 shadow-sm ${className}`} style={style}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < items.length - 1 && <View className="h-px bg-border-subtle" />}
          </React.Fragment>
        ))}
      </View>
    </SettingsRowGroupContext.Provider>
  );
};

interface SettingsRowProps {
  icon: IconName;
  title: string;
  subtitle?: React.ReactNode;
  onPress?: () => void;
  rightAccessory?: React.ReactNode;
  iconColor?: string;
  iconBackgroundColor?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  testID?: string;
}

const SettingsRow: React.FC<SettingsRowProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  rightAccessory,
  iconColor,
  iconBackgroundColor,
  accessibilityLabel,
  disabled,
  testID,
}) => {
  const { grouped } = useContext(SettingsRowGroupContext);
  const [textSecondary] = useCSSVariable([
    '--color-text-secondary',
  ]) as [string];

  const wrapperClass = grouped
    ? 'p-4 flex-row items-center'
    : 'bg-surface rounded-xl p-4 mb-4 shadow-sm flex-row items-center';

  const tintColor = iconColor ?? textSecondary;
  const tileBg = iconBackgroundColor ?? 'transparent';

  const content = (
    <>
      <View
        className="w-10 h-10 rounded-lg items-center justify-center mr-3"
        style={{ backgroundColor: tileBg }}
      >
        <Icon name={icon} size={22} color={tintColor} weight='semibold' />
      </View>
      <View className="flex-1 mr-2">
        <Text
          className="text-base font-semibold text-text-primary"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
        {typeof subtitle === 'string' ? (
          <Text
            className="text-sm text-text-secondary mt-0.5"
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {subtitle}
          </Text>
        ) : subtitle ? (
          <View className="mt-0.5">{subtitle}</View>
        ) : null}
      </View>
      {rightAccessory !== undefined ? (
        rightAccessory
      ) : onPress ? (
        <Icon name="chevron-forward" size={20} color={textSecondary} />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View className={wrapperClass} accessibilityLabel={accessibilityLabel} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      className={wrapperClass}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.7 } : null)}
    >
      {content}
    </Pressable>
  );
};

export default SettingsRow;
