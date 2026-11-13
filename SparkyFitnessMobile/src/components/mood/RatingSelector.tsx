import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { MOOD_RATING_MAX, MOOD_RATING_MIN } from '@workspace/shared';

const RATINGS = Array.from(
  { length: MOOD_RATING_MAX - MOOD_RATING_MIN + 1 },
  (_, i) => MOOD_RATING_MIN + i
);

interface RatingSelectorProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  lowLabel: string;
  highLabel: string;
}

const RatingSelector: React.FC<RatingSelectorProps> = ({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
}) => (
  <View>
    <Text className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
      {label}
    </Text>
    <View className="flex-row gap-1">
      {RATINGS.map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(value === n ? null : n)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${n}`}
          accessibilityState={{ selected: value === n }}
          className={`flex-1 h-9 rounded-md items-center justify-center ${
            value === n ? 'bg-accent-primary' : 'bg-raised'
          }`}
        >
          <Text
            className={`text-xs font-medium ${
              value === n ? 'text-white' : 'text-text-secondary'
            }`}
          >
            {n}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
    <View className="flex-row justify-between mt-1">
      <Text className="text-xs text-text-muted">{lowLabel}</Text>
      <Text className="text-xs text-text-muted">{highLabel}</Text>
    </View>
  </View>
);

export default RatingSelector;
