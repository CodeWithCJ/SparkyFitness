import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import { useCycleTests, useCycleTestMutations } from '../../../hooks/useCycleTests';
import { formatDate, addDays } from '../../../utils/dateUtils';
import Icon from '../../Icon';
import { useCSSVariable } from 'uniwind';
import type { SharedCycleTestEntry } from '@workspace/shared';

interface TestQuickLogProps {
  date: string;
}

type TestType = 'opk' | 'hpt';

const RESULTS: Record<TestType, { value: string; label: string }[]> = {
  opk: [
    { value: 'negative', label: 'Negative' },
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
    { value: 'peak', label: 'Peak' },
  ],
  hpt: [
    { value: 'negative', label: 'Negative' },
    { value: 'faint', label: 'Faint' },
    { value: 'positive', label: 'Positive' },
  ],
};

/**
 * TTC ovulation (OPK) / pregnancy (HPT) test quick-logger. Writes to
 * cycle_test_entries via POST/DELETE /v2/cycle/tests.
 */
const TestQuickLog: React.FC<TestQuickLogProps> = ({ date }) => {
  const [accentColor, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-danger',
  ]) as [string, string];
  const [testType, setTestType] = useState<TestType>('opk');

  // Show the last ~14 days of test history.
  const { tests, isLoading } = useCycleTests(addDays(date, -14), date);
  const { createTestEntryAsync, isCreating, deleteTestEntryAsync } = useCycleTestMutations();

  const handleLog = async (result: string) => {
    try {
      await createTestEntryAsync({ entry_date: date, test_type: testType, result });
      Toast.show({ type: 'success', text1: 'Test logged' });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not log test' });
    }
  };

  const handleDelete = async (entry: SharedCycleTestEntry) => {
    if (!entry.id) return;
    try {
      await deleteTestEntryAsync(entry.id);
    } catch {
      Toast.show({ type: 'error', text1: 'Could not remove test' });
    }
  };

  return (
    <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-3">
      <Text className="text-text-primary text-sm font-semibold">Log a Test</Text>

      {/* Test type toggle */}
      <View className="flex-row gap-2">
        {(['opk', 'hpt'] as TestType[]).map((t) => {
          const isSelected = testType === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTestType(t)}
              className={`rounded-full px-4 py-2 border ${
                isSelected ? 'bg-blue-50 border-blue-500' : 'bg-raised border-transparent'
              }`}
            >
              <Text className={`text-xs font-semibold ${isSelected ? 'text-blue-600' : 'text-text-secondary'}`}>
                {t === 'opk' ? 'Ovulation (OPK)' : 'Pregnancy (HPT)'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Result buttons */}
      <View className="flex-row flex-wrap gap-2">
        {RESULTS[testType].map((r) => (
          <TouchableOpacity
            key={r.value}
            disabled={isCreating}
            onPress={() => handleLog(r.value)}
            className="rounded-xl bg-raised px-4 py-2 border border-border-subtle"
          >
            <Text className="text-text-primary text-xs font-semibold">{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent history */}
      {isLoading ? (
        <ActivityIndicator color={accentColor} />
      ) : tests.length > 0 ? (
        <View className="gap-1 mt-1">
          <Text className="text-text-secondary text-xs mb-1">Recent</Text>
          {tests.slice(0, 6).map((entry) => (
            <View key={entry.id} className="flex-row items-center justify-between">
              <Text className="text-text-primary text-xs">
                {formatDate(entry.entry_date)} · {entry.test_type.toUpperCase()} · {entry.result}
              </Text>
              <TouchableOpacity onPress={() => handleDelete(entry)} hitSlop={8}>
                <Icon name="trash" size={16} color={dangerColor} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

export default TestQuickLog;
