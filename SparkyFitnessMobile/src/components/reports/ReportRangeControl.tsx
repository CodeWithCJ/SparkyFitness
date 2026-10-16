import React, { useRef } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import SegmentedControl from '../SegmentedControl';
import DateRangeSheet, { type DateRangeSheetRef } from '../DateRangeSheet';
import { formatShortDate } from '../../utils/dateUtils';
import { getAppLocale } from '../../localization';
import {
  clampCustomRange,
  trendRangeSegments,
  type CustomRange,
  type ReportRange,
} from '../../utils/trendRange';

interface ReportRangeControlProps {
  range: ReportRange;
  onRangeChange: (range: ReportRange) => void;
  /** With `onCustomRangeChange`, adds a Custom option that opens a date-range picker. */
  customRange?: CustomRange | null;
  onCustomRangeChange?: (range: CustomRange) => void;
}

/**
 * The 7d / 30d / 90d control every report shares, plus an optional Custom option. Custom
 * always asks for its days, so tapping it again changes them; the range only switches to
 * it once a range is confirmed, and the days picked are shown under the control.
 */
const ReportRangeControl: React.FC<ReportRangeControlProps> = ({
  range,
  onRangeChange,
  customRange,
  onCustomRangeChange,
}) => {
  const { t } = useTranslation();
  const rangeSheetRef = useRef<DateRangeSheetRef>(null);
  const hasCustom = !!onCustomRangeChange;

  return (
    <View>
      <SegmentedControl<ReportRange>
        segments={[
          ...trendRangeSegments(t),
          ...(hasCustom
            ? [
                {
                  key: 'custom' as const,
                  label: t('ranges.custom', { defaultValue: 'Custom' }),
                },
              ]
            : []),
        ]}
        activeKey={range}
        onSelect={(key) => {
          if (key === 'custom') rangeSheetRef.current?.present();
          else onRangeChange(key);
        }}
      />
      {range === 'custom' && customRange ? (
        <Text
          testID="report-custom-range-label"
          className="text-text-secondary text-xs text-center mt-1"
        >
          {`${formatShortDate(customRange.startDate, getAppLocale())} – ${formatShortDate(customRange.endDate, getAppLocale())}`}
        </Text>
      ) : null}
      {hasCustom ? (
        <DateRangeSheet
          ref={rangeSheetRef}
          title={t('ranges.customTitle', {
            defaultValue: 'Pick a date range',
          })}
          confirmLabel={t('ranges.customConfirm', {
            defaultValue: 'Show this range',
          })}
          onConfirm={(from, to) => {
            onCustomRangeChange?.(clampCustomRange(from, to));
            onRangeChange('custom');
          }}
        />
      ) : null}
    </View>
  );
};

export default ReportRangeControl;
