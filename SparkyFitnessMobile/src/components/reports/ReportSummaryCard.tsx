import React from 'react';
import { Pressable, Text, View } from 'react-native';

import Icon from '../Icon';

export interface ReportSummaryRow {
  label: string;
  value: string;
  /** A smaller second line under the value, e.g. a change against the previous period. */
  hint?: string;
  testID?: string;
  /** Makes the row a link, e.g. into a nutrient's trend. */
  onPress?: () => void;
}

/** A titled card of label / value rows, the summary block under a report's charts. */
const ReportSummaryCard: React.FC<{
  title: string;
  rows: ReportSummaryRow[];
}> = ({ title, rows }) => (
  <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
    <Text className="text-text-primary text-lg font-semibold mb-2">
      {title}
    </Text>
    {rows.map((row, index) => {
      const rowClass = `flex-row justify-between items-center py-2 ${
        index < rows.length - 1 ? 'border-b border-border-subtle' : ''
      }`;
      const content = (
        <>
          <Text className="text-text-secondary text-sm flex-1 mr-3">
            {row.label}
          </Text>
          <View className="items-end">
            <Text className="text-text-primary text-sm font-semibold">
              {row.value}
            </Text>
            {row.hint ? (
              <Text className="text-text-muted text-xs mt-0.5">{row.hint}</Text>
            ) : null}
          </View>
          {row.onPress ? (
            <View className="ml-2">
              <Icon name="chevron-forward" size={16} color="#999" />
            </View>
          ) : null}
        </>
      );
      return row.onPress ? (
        <Pressable
          key={row.label}
          testID={row.testID}
          accessibilityRole="button"
          className={rowClass}
          onPress={row.onPress}
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
        >
          {content}
        </Pressable>
      ) : (
        <View key={row.label} testID={row.testID} className={rowClass}>
          {content}
        </View>
      );
    })}
  </View>
);

export default ReportSummaryCard;
