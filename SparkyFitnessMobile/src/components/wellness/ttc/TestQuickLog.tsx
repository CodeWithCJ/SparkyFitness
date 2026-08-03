import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { useCycleTests, useCycleTestMutations } from '../../../hooks/useCycleTests';
import { formatDate, addDays } from '../../../utils/dateUtils';
import Icon from '../../Icon';
import { useCSSVariable } from 'uniwind';
import type { SharedCycleTestEntry } from '@workspace/shared';

import SegmentedControl from '../../SegmentedControl';

interface TestQuickLogProps {
  date: string;
}

type TestType = 'opk' | 'hpt';

const resultLabel = (value: string, t: (key: string) => string): string => {
  switch (value) {
    case 'negative': return t('mobileComponents.wellness.tests.negative');
    case 'low': return t('mobileComponents.wellness.tests.low');
    case 'high': return t('mobileComponents.wellness.tests.high');
    case 'peak': return t('mobileComponents.wellness.tests.peak');
    case 'faint': return t('mobileComponents.wellness.tests.faint');
    case 'positive': return t('mobileComponents.wellness.tests.positive');
    default: return value;
  }
};

const RESULTS: Record<TestType, { value: string }[]> = {
  opk: [
     { value: 'negative' }, { value: 'low' }, { value: 'high' }, { value: 'peak' },
  ],
  hpt: [
     { value: 'negative' }, { value: 'faint' }, { value: 'positive' },
  ],
};

const TestQuickLog: React.FC<TestQuickLogProps> = ({ date }) => {
  const [accentColor, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-danger',
  ]) as [string, string];
  const [testType, setTestType] = useState<TestType>('opk');
  const { t } = useTranslation();

  const { tests, isLoading } = useCycleTests(addDays(date, -14), date);
  const { createTestEntryAsync, isCreating, deleteTestEntryAsync } = useCycleTestMutations();

  const handleLog = async (result: string) => {
    try {
      await createTestEntryAsync({ entry_date: date, test_type: testType, result });
       Toast.show({ type: 'success', text1: t('mobileComponents.wellness.tests.logged') });
    } catch {
       Toast.show({ type: 'error', text1: t('mobileComponents.wellness.tests.logError') });
    }
  };

  const handleDelete = async (entry: SharedCycleTestEntry) => {
    if (!entry.id) return;
    try {
      await deleteTestEntryAsync(entry.id);
    } catch {
       Toast.show({ type: 'error', text1: t('mobileComponents.wellness.tests.removeError') });
    }
  };

  return (
    <View className="bg-surface rounded-xl p-4 border-0 shadow-sm gap-3">
       <Text className="text-text-primary text-sm font-semibold">{t('mobileComponents.wellness.tests.title')}</Text>

      {/* SegmentedControl tabs */}
      <SegmentedControl
        segments={[
           { key: 'opk', label: t('mobileComponents.wellness.tests.opk') },
           { key: 'hpt', label: t('mobileComponents.wellness.tests.hpt') },
        ]}
        activeKey={testType}
        onSelect={(key) => setTestType(key)}
      />

      {/* Result buttons */}
      <View className="flex-row flex-wrap gap-2 mt-1">
        {RESULTS[testType].map((r) => (
          <TouchableOpacity
            key={r.value}
            disabled={isCreating}
            onPress={() => handleLog(r.value)}
            className="rounded-xl bg-raised px-4 py-2 border border-border-subtle"
          >
             <Text className="text-text-primary text-xs font-semibold">{resultLabel(r.value, t)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tabular scannable history list */}
      {isLoading ? (
        <ActivityIndicator color={accentColor} />
      ) : tests.length > 0 ? (
        <View className="gap-2 mt-2">
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wider">
             {t('mobileComponents.wellness.tests.recent')}
          </Text>
          <View className="bg-raised rounded-xl border border-border-subtle overflow-hidden">
            {tests.slice(0, 6).map((entry, idx) => (
              <View
                key={entry.id ?? `test-${idx}`}
                className={`flex-row items-center justify-between p-3 ${
                  idx < Math.min(tests.length, 6) - 1 ? 'border-b border-border-subtle' : ''
                }`}
              >
                <Text className="text-text-secondary text-xs w-24">
                  {formatDate(entry.entry_date)}
                </Text>
                <Text className="text-text-primary text-xs font-semibold flex-1 text-center uppercase">
                  {entry.test_type}
                </Text>
                <Text className="text-text-primary text-xs font-bold capitalize flex-1 text-center">
                  {entry.result}
                </Text>
                <TouchableOpacity onPress={() => handleDelete(entry)} hitSlop={8} className="p-1">
                  <Icon name="trash" size={16} color={dangerColor} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default TestQuickLog;
