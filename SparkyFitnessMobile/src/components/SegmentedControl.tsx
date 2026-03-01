import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export type Segment<T extends string> = {
  key: T;
  label: string;
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
          className={`flex-1 py-2 rounded-md items-center ${
            activeKey === segment.key ? 'bg-surface' : ''
          }`}
          activeOpacity={0.7}
        >
          <Text
            className={`text-sm font-medium ${
              activeKey === segment.key ? 'text-text-primary' : 'text-text-muted'
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
