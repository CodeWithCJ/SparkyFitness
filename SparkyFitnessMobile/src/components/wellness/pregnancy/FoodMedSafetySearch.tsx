import React, { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { lookupSafety, FOOD_SAFETY, MED_SAFETY } from '@workspace/shared';
import type { SafetyItem, SafetyStatus } from '@workspace/shared';
import FormInput from '../../FormInput';
import SegmentedControl from '../../SegmentedControl';
import { useCSSVariable } from 'uniwind';

const STATUS_STYLE: Record<SafetyStatus, { bg: string; text: string; label: string }> = {
  safe: { bg: 'bg-green-100', text: 'text-green-700', label: 'Safe' },
  caution: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Caution' },
  avoid: { bg: 'bg-red-100', text: 'text-red-700', label: 'Avoid' },
};

const DEBOUNCE_MS = 200;

const FoodMedSafetySearch: React.FC = () => {
  const [category, setCategory] = useState<'food' | 'med'>('food');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo<SafetyItem[]>(() => {
    if (!debouncedQuery.trim()) return [];
    return lookupSafety(debouncedQuery, category === 'food' ? FOOD_SAFETY : MED_SAFETY);
  }, [debouncedQuery, category]);

  return (
    <View className="bg-surface rounded-2xl p-4 border border-border-subtle shadow-sm gap-3">
      <Text className="text-text-primary text-base font-bold">Food & Medication Safety</Text>

      <SegmentedControl
        segments={[
          { key: 'food', label: 'Food' },
          { key: 'med', label: 'Medications' },
        ]}
        activeKey={category}
        onSelect={setCategory}
      />

      <FormInput
        value={query}
        onChangeText={setQuery}
        placeholder={category === 'food' ? 'Search a food, e.g. sushi' : 'Search a medication, e.g. ibuprofen'}
      />

      {!debouncedQuery.trim() ? (
        <Text className="text-xs italic" style={{ color: textMuted }}>
          Search to check if it&apos;s considered safe during pregnancy.
        </Text>
      ) : results.length === 0 ? (
        <Text className="text-xs italic" style={{ color: textMuted }}>
          No match found. This list isn&apos;t exhaustive — ask your provider if unsure.
        </Text>
      ) : (
        <View className="gap-2">
          {results.map((item) => {
            const style = STATUS_STYLE[item.status];
            return (
              <View key={item.name} className="rounded-xl bg-raised p-3 gap-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-text-primary text-sm font-semibold flex-1 mr-2">
                    {item.name}
                  </Text>
                  <View className={`rounded-full px-2.5 py-0.5 ${style.bg}`}>
                    <Text className={`text-xs font-bold ${style.text}`}>{style.label}</Text>
                  </View>
                </View>
                <Text className="text-text-secondary text-xs leading-normal">{item.note}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

export default FoodMedSafetySearch;
