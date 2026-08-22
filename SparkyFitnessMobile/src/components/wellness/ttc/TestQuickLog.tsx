import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const RESULT_KEYS: Record<TestType, { value: string; key: string; fallback: string }[]> = {
  opk: [
    { value: 'negative', key: 'negative', fallback: 'Negative' },
    { value: 'low', key: 'low', fallback: 'Low' },
    { value: 'high', key: 'high', fallback: 'High' },
    { value: 'peak', key: 'peak', fallback: 'Peak' },
  ],
  hpt: [
    { value: 'negative', key: 'negative', fallback: 'Negative' },
    { value: 'faint', key: 'faint', fallback: 'Faint' },
    { value: 'positive', key: 'positive', fallback: 'Positive' },
  ],
};

function getResultLabel(t: (key: string, options: { defaultValue: string }) => string, result: string): string {
  switch (result) {
    case 'negative': return t('testQuickLog.results.negative', { defaultValue: 'Negative' });
    case 'low': return t('testQuickLog.results.low', { defaultValue: 'Low' });
    case 'high': return t('testQuickLog.results.high', { defaultValue: 'High' });
    case 'peak': return t('testQuickLog.results.peak', { defaultValue: 'Peak' });
    case 'faint': return t('testQuickLog.results.faint', { defaultValue: 'Faint' });
    case 'positive': return t('testQuickLog.results.positive', { defaultValue: 'Positive' });
    default: return result;
  }
}

function getTestTypeLabel(t: (key: string, options: { defaultValue: string }) => string, type: string): string {
  switch (type) {
    case 'opk': return t('testQuickLog.ovulationShort', { defaultValue: 'Ovulation' });
    case 'hpt': return t('testQuickLog.pregnancyShort', { defaultValue: 'Pregnancy' });
    default: return type;
  }
}

const TestQuickLog: React.FC<TestQuickLogProps> = ({ date }) => {
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];
  const [testType, setTestType] = useState<TestType>('opk');

  const { tests, isLoading } = useCycleTests(addDays(date, -14), date);
  const { createTestEntryAsync, isCreating, deleteTestEntryAsync } = useCycleTestMutations();

  const handleLog = async (result: string) => {
    try {
      await createTestEntryAsync({ entry_date: date, test_type: testType, result });
      Toast.show({ type: 'success', text1: t('testQuickLog.testLogged', { defaultValue: 'Test logged' }) });
    } catch {
      Toast.show({ type: 'error', text1: t('testQuickLog.logFailed', { defaultValue: 'Could not log test' }) });
    }
  };

  const handleDelete = async (entry: SharedCycleTestEntry) => {
    if (!entry.id) return;
    try {
      await deleteTestEntryAsync(entry.id);
    } catch {
      Toast.show({ type: 'error', text1: t('testQuickLog.removeFailed', { defaultValue: 'Could not remove test' }) });
    }
  };

  return (
    <View className="bg-surface rounded-xl p-4 border-0 shadow-sm gap-3">
      <Text className="text-text-primary text-sm font-semibold">{t('testQuickLog.title', { defaultValue: 'Log a Test' })}</Text>

      {/* SegmentedControl tabs */}
      <SegmentedControl
        segments={[
          { key: 'opk', label: t('testQuickLog.ovulation', { defaultValue: 'Ovulation (OPK)' }) },
          { key: 'hpt', label: t('testQuickLog.pregnancy', { defaultValue: 'Pregnancy (HPT)' }) },
        ]}
        activeKey={testType}
        onSelect={(key) => setTestType(key)}
      />

      {/* Result buttons */}
      <View className="flex-row flex-wrap gap-2 mt-1">
        {RESULT_KEYS[testType].map((r) => (
          <TouchableOpacity
            key={r.value}
            disabled={isCreating}
            onPress={() => handleLog(r.value)}
            className="rounded-xl bg-raised px-4 py-2 border border-border-subtle"
          >
            <Text className="text-text-primary text-xs font-semibold">{getResultLabel(t, r.value)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tabular scannable history list */}
      {isLoading ? (
        <ActivityIndicator color={accentColor} />
      ) : tests.length > 0 ? (
        <View className="gap-2 mt-2">
          <Text className="text-text-secondary text-xs font-semibold uppercase tracking-wider">
            {t('testQuickLog.recent', { defaultValue: 'Recent Logged Tests' })}
          </Text>
          <View className="rounded-xl overflow-hidden">
            {tests.slice(0, 6).map((entry, idx) => (
              <SwipeableDeleteRow
                key={entry.id ?? `test-${idx}`}
                title={t('testQuickLog.entryTitle', { defaultValue: '{{type}} · {{result}}', type: getTestTypeLabel(t, entry.test_type), result: getResultLabel(t, entry.result) })}
                onConfirmDelete={() => handleDelete(entry)}
                className={`flex-row items-center justify-between py-2.5 ${
                  idx < Math.min(tests.length, 6) - 1 ? 'border-b border-border-subtle' : ''
                }`}
              >
                <Text className="text-text-secondary text-xs w-24">
                  {formatDate(entry.entry_date, dateLocale)}
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
