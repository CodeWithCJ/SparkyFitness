import React from 'react';
import { Text, View } from 'react-native';

export type ReportChangeTone = 'positive' | 'negative' | 'neutral';

export interface ReportHighlight {
  label: string;
  value: string;
  /** A short change against the previous period, e.g. "+4%". */
  change?: string;
  /** Colors the change: green when it is good news, red when not, grey when neither applies. */
  changeTone?: ReportChangeTone;
  testID?: string;
}

const CHANGE_CLASS: Record<ReportChangeTone, string> = {
  positive: 'text-text-success',
  negative: 'text-text-danger-subtle',
  neutral: 'text-text-muted',
};

/**
 * The big-number tiles at the top of a report: the few figures worth seeing
 * before any chart, two to a row. Each can carry a change against the previous
 * period, colored by whether that direction is good for this figure.
 */
const ReportHighlights: React.FC<{ items: ReportHighlight[] }> = ({
  items,
}) => (
  <View className="flex-row flex-wrap -mx-1 mb-1">
    {items.map((item) => (
      <View key={item.label} className="w-1/2 p-1">
        <View
          testID={item.testID}
          className="bg-surface rounded-xl p-3 shadow-sm"
        >
          <Text className="text-text-secondary text-xs mb-1" numberOfLines={1}>
            {item.label}
          </Text>
          <Text
            className="text-text-primary text-xl font-bold"
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {item.value}
          </Text>
          {item.change ? (
            <Text
              className={`text-xs mt-0.5 font-medium ${
                CHANGE_CLASS[item.changeTone ?? 'neutral']
              }`}
              numberOfLines={1}
            >
              {item.change}
            </Text>
          ) : null}
        </View>
      </View>
    ))}
  </View>
);

export default ReportHighlights;
