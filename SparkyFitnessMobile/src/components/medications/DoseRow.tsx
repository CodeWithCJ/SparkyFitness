import React from 'react';
import { View, Text, Pressable, TouchableOpacity, Platform } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from '../Icon';

interface ScheduledDoseRowProps {
  kind: 'scheduled';
  status: 'pending' | 'taken' | 'skipped';
  /** Circle tap: logs the dose when pending, otherwise undoes the log. */
  onToggle: () => void;
  onTake: () => void;
  onSkip: () => void;
}

interface PrnDoseRowProps {
  kind: 'prn';
  /** Doses logged on the selected day; shown inside the circle. */
  count: number;
  /** Circle tap and the Take button both log one more dose. */
  onLog: () => void;
}

export type DoseRowProps = (ScheduledDoseRowProps | PrnDoseRowProps) & {
  title: string;
  /** Scheduled time, rendered emphasized ahead of the subtitle. */
  time?: string;
  subtitle?: string;
  /** Row tap, e.g. navigate to the medication */
  onPress?: () => void;
};

/**
 * Centers its content over an invisible copy of the pending-state
 * Take/Skip pair (same labels, padding, and font), so every actions
 * column keeps that width and rows don't shift between states.
 */
const SizedActionColumn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View className="items-center justify-center">
    <View className="flex-row items-center opacity-0" aria-hidden>
      <View className="rounded-full px-3 py-1">
        <Text className="text-sm font-semibold">Take</Text>
      </View>
      <View className="rounded-full px-3 py-1 ml-1">
        <Text className="text-sm font-semibold">Skip</Text>
      </View>
    </View>
    <View className="absolute inset-0 items-center justify-center">{children}</View>
  </View>
);

/**
 * One dose slot for the selected day: a scheduled dose with
 * take/skip/undo state, or an as-needed (PRN) medication with a
 * logged-dose count. All actions are visible; swipe gestures are
 * reserved for destructive actions elsewhere in the app.
 */
const DoseRow: React.FC<DoseRowProps> = (props) => {
  const { title, time, subtitle, onPress } = props;

  const [iconSuccess, iconDecorative, iconDanger, accentPrimary] = useCSSVariable([
    '--color-icon-success',
    '--color-icon-decorative',
    '--color-icon-danger',
    '--color-accent-primary',
  ]) as [string, string, string, string];

  const completed = props.kind === 'scheduled' && props.status !== 'pending';
  const showTime = time != null && time !== '';
  const showSubtitle = subtitle != null && subtitle !== '';
  const taken = props.kind === 'scheduled' && props.status === 'taken';
  const skipped = props.kind === 'scheduled' && props.status === 'skipped';
  const titleClass = taken
    ? 'text-text-secondary line-through'
    : skipped
      ? 'text-text-muted'
      : 'text-text-primary';
  const circleBorderColor =
    props.kind === 'scheduled'
      ? props.status === 'taken'
        ? iconSuccess
        : props.status === 'skipped'
          ? iconDanger
          : iconDecorative
      : props.count > 0
        ? iconSuccess
        : iconDecorative;
  const onCirclePress = props.kind === 'scheduled' ? props.onToggle : props.onLog;
  const circleAccessibilityLabel =
    props.kind === 'scheduled'
      ? props.status === 'pending'
        ? `Mark ${title} taken`
        : `Unmark ${title}`
      : `Log ${title}`;

  const renderActions = () => {
    if (props.kind === 'prn') {
      return (
        <SizedActionColumn>
          <TouchableOpacity
            onPress={props.onLog}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            activeOpacity={0.6}
            accessibilityRole="button"
            className="rounded-full px-3 py-1 bg-raised"
          >
            <Text className="text-sm font-semibold" style={{ color: accentPrimary }}>Take</Text>
          </TouchableOpacity>
        </SizedActionColumn>
      );
    }
    if (props.status === 'pending') {
      return (
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={props.onTake}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Take ${title}`}
            className="rounded-full px-3 py-1 bg-raised"
          >
            <Text className="text-sm font-semibold" style={{ color: accentPrimary }}>Take</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={props.onSkip}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Skip ${title}`}
            className="rounded-full px-3 py-1 ml-1 bg-raised"
          >
            <Text className="text-sm font-semibold text-accent-primary">Skip</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <SizedActionColumn>
        <Text className="text-sm text-text-secondary">
          {props.status === 'taken' ? 'Taken' : 'Skipped'}
        </Text>
      </SizedActionColumn>
    );
  };

  return (
    <Pressable
      className="py-2 px-1 flex-row items-center bg-surface"
      onPress={onPress}
      disabled={onPress == null}
    >
      <Pressable
        onPress={onCirclePress}
        className="w-6 h-6 rounded-full items-center justify-center mr-3"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={circleAccessibilityLabel}
        style={{ backgroundColor: 'transparent', borderWidth: 1.5, borderColor: circleBorderColor }}
      >
        {props.kind === 'scheduled' && props.status === 'taken' && (
          <Icon name="checkmark" size={Platform.OS === 'ios' ? 12 : 16} color={iconSuccess} />
        )}
        {props.kind === 'scheduled' && props.status === 'skipped' && (
          <Icon name="close" size={Platform.OS === 'ios' ? 12 : 16} color={iconDanger} />
        )}
        {props.kind === 'prn' && props.count > 0 && (
          <Text className="text-xs font-bold" style={{ color: iconSuccess }}>{props.count}</Text>
        )}
      </Pressable>
      <View className="flex-1">
        <Text className={`text-base font-semibold ${titleClass}`} numberOfLines={1}>
          {title}
        </Text>
        {(showTime || showSubtitle) && (
          <Text className={`text-xs ${completed ? 'text-text-muted' : 'text-text-secondary'} mt-0.5`} numberOfLines={1}>
            {showTime && (
              <Text className={`${completed ? 'text-text-muted' : 'text-text-primary'}`}>
                {time}
              </Text>
            )}
            {showTime && showSubtitle ? ' · ' : null}
            {showSubtitle ? subtitle : null}
          </Text>
        )}
      </View>
      <View className="ml-2">{renderActions()}</View>
    </Pressable>
  );
};

export default DoseRow;
