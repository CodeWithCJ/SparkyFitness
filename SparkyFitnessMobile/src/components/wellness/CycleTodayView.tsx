import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import { useCycleLog } from '../../hooks/useCycleLogs';
import { useUpsertCycleLog } from '../../hooks/useUpsertCycleLog';
import { useCycleMode } from '../../hooks/useCycleMode';
import { upsertBbt } from '../../services/api/cycleApi';
import { addLog } from '../../services/LogService';
import CycleIcon from './CycleIcon';
import CycleSymptomPicker from './CycleSymptomPicker';
import Button from '../ui/Button';
import FormInput from '../FormInput';
import { useCSSVariable } from 'uniwind';
import type { FlowLevel } from '@workspace/shared';

interface CycleTodayViewProps {
  date: string;
}

const FLOW_OPTIONS: { value: FlowLevel; label: string; icon: string }[] = [
  { value: 'none', label: 'None', icon: 'flow-none' },
  { value: 'spotting', label: 'Spot', icon: 'flow-spotting' },
  { value: 'light', label: 'Light', icon: 'flow-light' },
  { value: 'medium', label: 'Med', icon: 'flow-medium' },
  { value: 'heavy', label: 'Heavy', icon: 'flow-heavy' },
];

const MUCUS_OPTIONS = [
  { value: 'dry', label: 'Dry' },
  { value: 'sticky', label: 'Sticky' },
  { value: 'creamy', label: 'Creamy' },
  { value: 'watery', label: 'Watery' },
  { value: 'eggwhite', label: 'Egg White' },
];

const CERVICAL_POSITION_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const CycleTodayView: React.FC<CycleTodayViewProps> = ({ date }) => {
  const { log, isLoading, refetch } = useCycleLog({ date });
  const { upsertLogAsync, isSaving } = useUpsertCycleLog();
  const { mode } = useCycleMode();
  const isTtc = mode === 'ttc';
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  // Local draft state
  const [flowLevel, setFlowLevel] = useState<FlowLevel | null>(null);
  const [mucus, setMucus] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [bbt, setBbt] = useState('');
  const [intercourse, setIntercourse] = useState<boolean | null>(null);
  const [intercourseProtected, setIntercourseProtected] = useState<boolean | null>(null);
  const [cervicalPosition, setCervicalPosition] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (log) {
      setFlowLevel(log.flow_level ?? null);
      setMucus(log.cervical_mucus ?? null);
      setNotes(log.notes ?? '');
      setBbt(log.bbt ? String(log.bbt) : '');
      setIntercourse(log.intercourse ?? null);
      setIntercourseProtected(log.intercourse_protected ?? null);
      setCervicalPosition(log.cervical_position ?? null);
    } else {
      setFlowLevel(null);
      setMucus(null);
      setNotes('');
      setBbt('');
      setIntercourse(null);
      setIntercourseProtected(null);
      setCervicalPosition(null);
    }
  }, [log]);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      // 1. Save daily log
      await upsertLogAsync({
        date,
        body: {
          flow_level: flowLevel,
          cervical_mucus: mucus,
          notes: notes || null,
          ...(isTtc
            ? {
                intercourse,
                intercourse_protected: intercourse ? intercourseProtected : null,
                cervical_position: cervicalPosition,
              }
            : {}),
        },
      });

      // 2. Save BBT custom measurement if input is present/changed
      const bbtVal = bbt.trim() ? parseFloat(bbt) : null;
      if (isNaN(bbtVal as number) && bbt.trim()) {
        Toast.show({ type: 'error', text1: 'Invalid temperature input' });
        return;
      }
      await upsertBbt(date, bbtVal);

      // Refetch to pull latest server-hydrated BBT
      refetch();
    } catch (error) {
      addLog(`Failed to save cycle daily view: ${error}`, 'ERROR');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center py-12">
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
      <View className="gap-6 mt-4">
        {/* Flow Level */}
        <View className="bg-surface rounded-2xl p-4 shadow-sm border border-border-subtle">
          <Text className="text-text-primary text-sm font-semibold mb-3">Flow Level</Text>
          <View className="flex-row justify-between">
            {FLOW_OPTIONS.map((opt) => {
              const isSelected = flowLevel === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setFlowLevel(opt.value)}
                  className={`items-center justify-center rounded-xl p-2 flex-1 mx-1 border ${
                    isSelected ? 'bg-red-50 border-red-500' : 'bg-raised border-transparent'
                  }`}
                >
                  <CycleIcon id={opt.icon} size={24} />
                  <Text className={`text-xs mt-1 font-medium ${isSelected ? 'text-red-600' : 'text-text-secondary'}`}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Symptoms */}
        <View className="bg-surface rounded-2xl p-4 shadow-sm border border-border-subtle">
          <CycleSymptomPicker date={date} />
        </View>

        {/* Cervical Mucus */}
        <View className="bg-surface rounded-2xl p-4 shadow-sm border border-border-subtle">
          <Text className="text-text-primary text-sm font-semibold mb-3">Cervical Mucus</Text>
          <View className="flex-row flex-wrap gap-2">
            {MUCUS_OPTIONS.map((opt) => {
              const isSelected = mucus === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setMucus(mucus === opt.value ? null : opt.value)}
                  className={`rounded-full px-4 py-2 border ${
                    isSelected ? 'bg-blue-50 border-blue-500' : 'bg-raised border-transparent'
                  }`}
                >
                  <Text className={`text-xs font-semibold ${isSelected ? 'text-blue-600' : 'text-text-secondary'}`}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* TTC: Intercourse + Cervical Position */}
        {isTtc && (
          <View className="bg-surface rounded-2xl p-4 shadow-sm border border-border-subtle gap-4">
            <View>
              <Text className="text-text-primary text-sm font-semibold mb-3">Intercourse</Text>
              <View className="flex-row gap-2">
                {[
                  { label: 'None', val: null as boolean | null },
                  { label: 'Yes', val: true },
                  { label: 'No', val: false },
                ].map((opt) => {
                  const isSelected = intercourse === opt.val;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      onPress={() => setIntercourse(opt.val)}
                      className={`rounded-full px-4 py-2 border ${
                        isSelected ? 'bg-blue-50 border-blue-500' : 'bg-raised border-transparent'
                      }`}
                    >
                      <Text className={`text-xs font-semibold ${isSelected ? 'text-blue-600' : 'text-text-secondary'}`}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {intercourse === true && (
              <View>
                <Text className="text-text-primary text-sm font-semibold mb-3">Protection</Text>
                <View className="flex-row gap-2">
                  {[
                    { label: 'Protected', val: true },
                    { label: 'Unprotected', val: false },
                  ].map((opt) => {
                    const isSelected = intercourseProtected === opt.val;
                    return (
                      <TouchableOpacity
                        key={opt.label}
                        onPress={() => setIntercourseProtected(opt.val)}
                        className={`rounded-full px-4 py-2 border ${
                          isSelected ? 'bg-blue-50 border-blue-500' : 'bg-raised border-transparent'
                        }`}
                      >
                        <Text className={`text-xs font-semibold ${isSelected ? 'text-blue-600' : 'text-text-secondary'}`}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <View>
              <Text className="text-text-primary text-sm font-semibold mb-3">Cervical Position</Text>
              <View className="flex-row gap-2">
                {CERVICAL_POSITION_OPTIONS.map((opt) => {
                  const isSelected = cervicalPosition === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setCervicalPosition(cervicalPosition === opt.value ? null : opt.value)}
                      className={`rounded-full px-4 py-2 border ${
                        isSelected ? 'bg-blue-50 border-blue-500' : 'bg-raised border-transparent'
                      }`}
                    >
                      <Text className={`text-xs font-semibold ${isSelected ? 'text-blue-600' : 'text-text-secondary'}`}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* Basal Body Temperature */}
        <View className="bg-surface rounded-2xl p-4 shadow-sm border border-border-subtle">
          <Text className="text-text-primary text-sm font-semibold mb-2">Basal Body Temperature</Text>
          <Text className="text-text-secondary text-xs mb-3">
            Track your waking temperature (°C) to identify biphasic shifts post-ovulation.
          </Text>
          <FormInput
            value={bbt}
            onChangeText={setBbt}
            placeholder="e.g. 36.5"
            keyboardType="decimal-pad"
          />
        </View>

        {/* Notes */}
        <View className="bg-surface rounded-2xl p-4 shadow-sm border border-border-subtle">
          <Text className="text-text-primary text-sm font-semibold mb-2">Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Log details about how you feel, energy level..."
            multiline
            numberOfLines={4}
            className="bg-raised rounded-xl p-3 text-text-primary text-sm min-h-[80px]"
            style={{ textAlignVertical: 'top' }}
          />
        </View>

        {/* Save Button */}
        <View className="px-4">
          <Button variant="primary" disabled={isSaving || submitting} onPress={handleSave}>
            {isSaving || submitting ? 'Saving...' : 'Save Log Entry'}
          </Button>
        </View>
      </View>
    </ScrollView>
  );
};

export default CycleTodayView;
