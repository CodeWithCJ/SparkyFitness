import React, { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import { lookupSafety, FOOD_SAFETY, MED_SAFETY } from '@workspace/shared';
import type { SafetyItem, SafetyStatus } from '@workspace/shared';
import FormInput from '../../FormInput';
import SegmentedControl from '../../SegmentedControl';

const STATUS_STYLE: Record<SafetyStatus, { bg: string; text: string }> = {
  safe: { bg: 'bg-green-100', text: 'text-green-700' },
  caution: { bg: 'bg-amber-100', text: 'text-amber-800' },
  avoid: { bg: 'bg-red-100', text: 'text-red-700' },
};

const safetyLabel = (status: SafetyStatus, t: (key: string) => string): string => {
  switch (status) {
    case 'safe': return t('mobileComponents.wellness.safety.safe');
    case 'caution': return t('mobileComponents.wellness.safety.caution');
    case 'avoid': return t('mobileComponents.wellness.safety.avoid');
  }
};

const DEBOUNCE_MS = 200;

const FoodMedSafetySearch: React.FC = () => {
  const [category, setCategory] = useState<'food' | 'med'>('food');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo<SafetyItem[]>(() => {
    if (!debouncedQuery.trim()) return [];
    return lookupSafety(debouncedQuery, category === 'food' ? FOOD_SAFETY : MED_SAFETY);
  }, [debouncedQuery, category]);

  return (
    <View className="bg-surface rounded-xl p-4 border-0 shadow-sm gap-3">
       <Text className="text-text-primary text-base font-bold">{t('mobileComponents.wellness.safety.title')}</Text>

      <SegmentedControl
        segments={[
           { key: 'food', label: t('mobileComponents.wellness.safety.food') },
           { key: 'med', label: t('mobileComponents.wellness.safety.medications') },
        ]}
        activeKey={category}
        onSelect={setCategory}
      />

      <FormInput
        value={query}
        onChangeText={setQuery}
         placeholder={category === 'food' ? t('mobileComponents.wellness.safety.foodPlaceholder') : t('mobileComponents.wellness.safety.medPlaceholder')}
      />

      {!debouncedQuery.trim() ? (
        <Text className="text-xs italic" style={{ color: textMuted }}>
           {t('mobileComponents.wellness.safety.empty')}
        </Text>
      ) : results.length === 0 ? (
        <Text className="text-xs italic" style={{ color: textMuted }}>
           {t('mobileComponents.wellness.safety.none')}
        </Text>
      ) : (
        <View>
          {results.map((item, idx) => {
            const style = STATUS_STYLE[item.status];
            return (
              <View
                key={item.name}
                className={`py-2 gap-1 ${idx < results.length - 1 ? 'border-b border-border-subtle' : ''}`}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-text-primary text-base font-semibold flex-1 mr-2">
                    {item.name}
                  </Text>
                  <View className={`rounded-full px-2.5 py-0.5 ${style.bg}`}>
                     <Text className={`text-xs font-bold ${style.text}`}>{safetyLabel(item.status, t)}</Text>
                  </View>
                </View>
                <Text className="text-text-secondary text-xs leading-normal">{item.note}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text className="text-text-secondary text-sm">
         {t('mobileComponents.wellness.safety.guidance')}
      </Text>
    </View>
  );
};

export default FoodMedSafetySearch;
