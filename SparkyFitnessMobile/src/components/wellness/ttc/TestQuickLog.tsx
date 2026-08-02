import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import { useCycleTests, useCycleTestMutations } from '../../../hooks/useCycleTests';
import { formatDate, addDays } from '../../../utils/dateUtils';
import SwipeableDeleteRow from '../../SwipeableDeleteRow';
import { useCSSVariable } from 'uniwind';
import type { SharedCycleTestEntry } from '@workspace/shared';

import SegmentedControl from '../../SegmentedControl';

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

const TestQuickLog: React.FC<TestQuickLogProps> = ({ date }) => {
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const [testType, setTestType] = useState<TestType>('opk');

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
    <View className="bg-surface rounded-xl p-4 border-0 shadow-sm gap-3">
      <Text className="text-text-primary text-sm font-semibold">Log a Test</Text>

      {/* SegmentedControl tabs */}
      <SegmentedControl
        segments={[
          { key: 'opk', label: 'Ovulation (OPK)' },
          { key: 'hpt', label: 'Pregnancy (HPT)' },
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
            <Text className="text-text-primary text-xs font-semibold">{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tabular scannable history list */}
      {isLoading ? (
        <ActivityIndicator color={accentColor} />
      ) : tests.length > 0 ? (
        <View className="gap-2 mt-2">
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wider">
            Recent Logged Tests
          </Text>
          <View className="rounded-xl overflow-hidden">
            {tests.slice(0, 6).map((entry, idx) => (
              <SwipeableDeleteRow
                key={entry.id ?? `test-${idx}`}
                title={`${entry.test_type.toUpperCase()} · ${entry.result}`}
                onConfirmDelete={() => handleDelete(entry)}
                className={`flex-row items-center justify-between py-2.5 ${
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
              </SwipeableDeleteRow>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default TestQuickLog;
