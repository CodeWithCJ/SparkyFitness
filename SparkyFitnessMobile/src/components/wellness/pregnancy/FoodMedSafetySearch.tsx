import React, { useEffect, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FOOD_SAFETY, MED_SAFETY } from '@workspace/shared';
import type { SafetyItem, SafetyStatus } from '@workspace/shared';
import FormInput from '../../FormInput';
import SegmentedControl from '../../SegmentedControl';
import { localizeSafetyStatus } from '../../../utils/safetyLocalization';
import {
  localizeSafetyName,
  localizeSafetyNote,
  lookupSafetyLocalized,
} from '../../../utils/pregnancySafetyLocalization';

const STATUS_STYLE: Record<SafetyStatus, { bg: string; text: string }> = {
  safe: { bg: 'bg-green-100', text: 'text-green-700' },
  caution: { bg: 'bg-amber-100', text: 'text-amber-800' },
  avoid: { bg: 'bg-red-100', text: 'text-red-700' },
};

const DEBOUNCE_MS = 200;

const FoodMedSafetySearch: React.FC = () => {
  const { t } = useTranslation();
  const [category, setCategory] = useState<'food' | 'med'>('food');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo<SafetyItem[]>(() => {
    if (!debouncedQuery.trim()) return [];
    const group = category === 'food' ? 'food' : 'med';
    return lookupSafetyLocalized(
      debouncedQuery,
      category === 'food' ? FOOD_SAFETY : MED_SAFETY,
      group,
      t,
    );
  }, [debouncedQuery, category, t]);

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
      <Text className="text-base font-bold text-text-secondary">{t('pregnancySafety.title', { defaultValue: 'Food & Medication Safety' })}</Text>

      <SegmentedControl
        segments={[
          { key: 'food', label: t('pregnancySafety.food', { defaultValue: 'Food' }) },
          { key: 'med', label: t('pregnancySafety.medications', { defaultValue: 'Medications' }) },
        ]}
        activeKey={category}
        onSelect={setCategory}
      />

      <FormInput
        value={query}
        onChangeText={setQuery}
        placeholder={category === 'food'
          ? t('pregnancySafety.foodExample', { defaultValue: 'Sushi' })
          : t('pregnancySafety.medicationExample', { defaultValue: 'Ibuprofen' })}
      />

      {!debouncedQuery.trim() ? (
        <Text className="text-text-secondary text-sm">
          {t('pregnancySafety.searchHint', { defaultValue: 'Search to see how a food or medication is commonly categorized during pregnancy.' })}
        </Text>
      ) : results.length === 0 ? (
        <Text className="text-text-secondary text-sm">
          {t('pregnancySafety.noMatch', { defaultValue: 'No match found. This list is not exhaustive, so ask your provider if unsure.' })}
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
                    {localizeSafetyName(item, category === 'food' ? 'food' : 'med', t)}
                  </Text>
                  <View className={`rounded-full px-2.5 py-0.5 ${style.bg}`}>
                    <Text className={`text-xs font-bold ${style.text}`}>{localizeSafetyStatus(t, item.status)}</Text>
                  </View>
                </View>
                <Text className="text-text-secondary text-xs leading-normal">{localizeSafetyNote(item, category === 'food' ? 'food' : 'med', t)}</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text className="text-text-secondary text-sm">
        {t('pregnancySafety.disclaimer', { defaultValue: 'General guidance only, not medical advice. Always confirm with your provider.' })}
      </Text>
    </View>
  );
};

export default FoodMedSafetySearch;
