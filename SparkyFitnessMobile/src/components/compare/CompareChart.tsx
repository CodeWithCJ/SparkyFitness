import React, { useState } from 'react';
import { View } from 'react-native';
import {
  type CompareQuestion,
  type CompareResponse,
  timingOf,
} from '@workspace/shared';
import { useTranslation } from 'react-i18next';

import SegmentedControl from '../SegmentedControl';
import CompareBars from './CompareBars';
import CompareOverTimeChart from './CompareOverTimeChart';
import CompareScatterChart from './CompareScatterChart';

interface CompareChartProps {
  response: CompareResponse;
  question: CompareQuestion;
}

type ChartView = 'dots' | 'time';

const CompareChart: React.FC<CompareChartProps> = ({ response, question }) => {
  const { t } = useTranslation();
  const [view, setView] = useState<ChartView>('dots');
  const { mode } = timingOf(question.choice);

  const segments = [
    {
      key: 'dots' as const,
      label:
        mode === 'week'
          ? t('compareReport.chart.eachWeek', {
              defaultValue: 'Each week as a dot',
            })
          : t('compareReport.chart.eachDay', {
              defaultValue: 'Each day as a dot',
            }),
    },
    {
      key: 'time' as const,
      label: t('compareReport.chart.overTime', { defaultValue: 'Over time' }),
    },
  ];

  return (
    <View>
      <SegmentedControl
        segments={segments}
        activeKey={view}
        onSelect={setView}
      />
      {view === 'time' ? (
        <CompareOverTimeChart response={response} question={question} />
      ) : response.result.binary ? (
        <CompareBars response={response} question={question} />
      ) : (
        <CompareScatterChart response={response} question={question} />
      )}
    </View>
  );
};

export default CompareChart;
