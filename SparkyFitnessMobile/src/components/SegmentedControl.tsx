import { View, Text, TouchableOpacity } from 'react-native';

export type Segment<T extends string> = {
  key: T;
  label: string;
  /** Optional accent: a dot before the label and a matching underline while selected. */
  color?: string;
};

type SegmentedControlProps<T extends string> = {
  segments: Segment<T>[];
  activeKey: T;
  onSelect: (key: T) => void;
};

const SegmentedControl = <T extends string>({
  segments,
  activeKey,
  onSelect,
}: SegmentedControlProps<T>) => (
  <View>
    <View className="flex-row bg-raised p-1 rounded-lg">
      {segments.map((segment) => (
        <TouchableOpacity
          key={segment.key}
          onPress={() => onSelect(segment.key)}
          className={`flex-1 flex-row py-2 rounded-md items-center ${
            activeKey === segment.key ? 'bg-surface' : ''
          } justify-center gap-1.5`}
          style={
            activeKey === segment.key && segment.color
              ? { borderWidth: 1.5, borderColor: segment.color }
              : undefined
          }
          activeOpacity={0.7}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeKey === segment.key }}
        >
          {segment.color && (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: segment.color,
                opacity: activeKey === segment.key ? 1 : 0.5,
              }}
            />
          )}
          <Text
            className={`text-sm font-medium ${
              activeKey === segment.key
                ? 'text-text-primary'
                : 'text-text-muted'
            }`}
          >
            {segment.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

export default SegmentedControl;
