import React, { useRef } from 'react';
import { View, Text, Pressable, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Icon from '../Icon';

const ACTION_WIDTH = 80;

type IconName = React.ComponentProps<typeof Icon>['name'];

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
  /** Circle tap and the Log action both log one more dose. */
  onLog: () => void;
  /** Removes the most recently logged dose. */
  onUndoLast: () => void;
}

export type DoseRowProps = (ScheduledDoseRowProps | PrnDoseRowProps) & {
  title: string;
  subtitle?: string;
  /** Row tap, e.g. navigate to the medication; renders a chevron when set. */
  onPress?: () => void;
  /** 'swipe' hides actions behind a right swipe; 'inline' renders visible buttons. */
  actionsStyle: 'swipe' | 'inline';
};

interface SwipeAction {
  label: string;
  icon: IconName;
  backgroundColor: string;
  onPress: () => void;
}

/**
 * One dose slot for the selected day: a scheduled dose with
 * take/skip/undo state, or an as-needed (PRN) medication with a
 * logged-dose count.
 */
const DoseRow: React.FC<DoseRowProps> = (props) => {
  const { title, subtitle, onPress, actionsStyle } = props;
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  const [successBg, iconSuccess, iconDecorative, iconWarning, bgWarning, accentPrimary] = useCSSVariable([
    '--color-bg-success',
    '--color-icon-success',
    '--color-icon-decorative',
    '--color-icon-warning',
    '--color-bg-warning',
    '--color-accent-primary',
  ]) as [string, string, string, string, string, string];

  const completed = props.kind === 'scheduled' ? props.status !== 'pending' : props.count > 0;
  const circleBorderColor =
    props.kind === 'scheduled'
      ? props.status === 'taken'
        ? iconSuccess
        : props.status === 'skipped'
          ? iconWarning
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

  const swipeActions: SwipeAction[] =
    props.kind === 'scheduled'
      ? [
          { label: 'Take', icon: 'checkmark', backgroundColor: successBg, onPress: props.onTake },
          { label: 'Skip', icon: 'close', backgroundColor: bgWarning, onPress: props.onSkip },
        ]
      : [
          { label: 'Log', icon: 'add', backgroundColor: successBg, onPress: props.onLog },
          ...(props.count > 0
            ? [{ label: 'Undo', icon: 'arrow-undo' as IconName, backgroundColor: bgWarning, onPress: props.onUndoLast }]
            : []),
        ];

  const renderRightActions = () => (
    <View style={{ flexDirection: 'row' }}>
      {swipeActions.map((action) => (
        <TouchableOpacity
          key={action.label}
          className="justify-center items-center"
          style={{ width: ACTION_WIDTH, backgroundColor: action.backgroundColor }}
          onPress={() => {
            swipeableRef.current?.close();
            action.onPress();
          }}
          activeOpacity={0.7}
        >
          <Icon name={action.icon} size={20} color="#FFFFFF" />
          <Text className="text-white font-semibold text-xs mt-0.5">{action.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderInlineActions = () => {
    if (props.kind === 'prn') {
      return (
        <TouchableOpacity
          onPress={props.onLog}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel={`Log ${title}`}
          className="rounded-full px-3 py-1"
          style={{ backgroundColor: accentPrimary + '18' }}
        >
          <Text className="text-sm font-semibold" style={{ color: accentPrimary }}>Log</Text>
        </TouchableOpacity>
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
            className="rounded-full px-3 py-1"
            style={{ backgroundColor: accentPrimary + '18' }}
          >
            <Text className="text-sm font-semibold" style={{ color: accentPrimary }}>Take</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={props.onSkip}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Skip ${title}`}
            className="rounded-full px-3 py-1 ml-1"
          >
            <Text className="text-sm font-semibold text-text-secondary">Skip</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View className="flex-row items-center">
        <Icon
          name={props.status === 'taken' ? 'checkmark' : 'close'}
          size={14}
          color={props.status === 'taken' ? iconSuccess : iconWarning}
        />
        <Text className="text-xs text-text-secondary ml-1">
          {props.status === 'taken' ? 'Taken' : 'Skipped'}
        </Text>
      </View>
    );
  };

  const row = (
    <Pressable
      className="py-2.5 px-1 flex-row items-center bg-surface"
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
          <Icon name="checkmark" size={14} color={iconSuccess} />
        )}
        {props.kind === 'scheduled' && props.status === 'skipped' && (
          <Icon name="close" size={14} color={iconWarning} />
        )}
        {props.kind === 'prn' && props.count > 0 && (
          <Text className="text-xs font-bold" style={{ color: iconSuccess }}>{props.count}</Text>
        )}
      </Pressable>
      <View className="flex-1">
        <Text
          className={`text-base ${completed ? 'text-text-muted' : 'text-text-primary'}`}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle != null && subtitle !== '' && (
          <Text className="text-xs text-text-secondary mt-0.5" numberOfLines={1}>{subtitle}</Text>
        )}
      </View>
      {actionsStyle === 'inline' && renderInlineActions()}
      {onPress != null && (
        <Icon name="chevron-forward" size={16} color={iconDecorative} style={{ marginLeft: 6 }} />
      )}
    </Pressable>
  );

  if (actionsStyle === 'swipe') {
    return (
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        rightThreshold={40}
      >
        {row}
      </ReanimatedSwipeable>
    );
  }
  return row;
};

export default DoseRow;
