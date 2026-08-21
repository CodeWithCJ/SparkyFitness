import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity, Switch, TextInput } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useCycleHistory } from '../../hooks/useCycleHistory';
import CycleBarGlyph from './CycleBarGlyph';
import Icon from '../Icon';
import Button from '../ui/Button';
import SwipeableDeleteRow from '../SwipeableDeleteRow';
import CalendarSheet, { type CalendarSheetRef } from '../CalendarSheet';
import { getTodayDate, formatDate } from '../../utils/dateUtils';

const CycleHistoryList: React.FC = () => {
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { cycles, createCycle, deleteCycle } = useCycleHistory();
  const maxCycleLength = cycles.reduce((max, c) => Math.max(max, c.cycle_length || 0), 0);
  const [showAddForm, setShowAddForm] = useState(false);
  const calendarSheetRef = useRef<CalendarSheetRef>(null);
  const [accentColor] = useCSSVariable(['--color-accent-primary']) as [string];

  // Form State
  const [startDate, setStartDate] = useState(getTodayDate());
  const [periodLength, setPeriodLength] = useState('5');
  const [cycleLength, setCycleLength] = useState('28');
  const [isExcluded, setIsExcluded] = useState(false);

  const handleAdd = () => {
    if (!startDate) return;
    createCycle({
      start_date: startDate,
      period_length: parseInt(periodLength, 10) || 5,
      cycle_length: parseInt(cycleLength, 10) || 28,
      is_excluded: isExcluded,
    });
    // Reset Form
    setStartDate(getTodayDate());
    setPeriodLength('5');
    setCycleLength('28');
    setIsExcluded(false);
    setShowAddForm(false);
  };

  return (
    <View className="gap-4">
      <View className="flex-row justify-between items-center">
        <Text className="text-text-primary text-base font-bold">{t('cycleHistory.title', { defaultValue: 'Cycle History' })}</Text>
        <TouchableOpacity
          onPress={() => setShowAddForm(!showAddForm)}
          className="flex-row items-center"
        >
          <Icon name={showAddForm ? 'close' : 'add'} size={18} color={accentColor} />
          <Text className="font-semibold text-sm ml-1" style={{ color: accentColor }}>
            {showAddForm ? t('common.cancel', { defaultValue: 'Cancel' }) : t('common.add', { defaultValue: 'Add' })}
          </Text>
        </TouchableOpacity>
      </View>

      {showAddForm && (
        <View className="bg-surface rounded-xl p-4 border-0 shadow-sm gap-3">
          <Text className="text-text-primary font-semibold text-sm">{t('cycleHistory.logManual', { defaultValue: 'Log Manual Cycle' })}</Text>
          
          <View>
            <Text className="text-text-secondary text-xs mb-1">{t('cycleHistory.startDate', { defaultValue: 'Start Date' })}</Text>
            <TouchableOpacity
              onPress={() => calendarSheetRef.current?.present()}
              className="bg-raised rounded-lg p-2.5 text-text-primary border border-border-subtle flex-row justify-between items-center"
            >
              <Text className="text-text-primary">
                {startDate ? formatDate(startDate, dateLocale) : t('cycleHistory.selectDate', { defaultValue: 'Select Date' })}
              </Text>
              <Icon name="calendar" size={18} color={accentColor} />
            </TouchableOpacity>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-text-secondary text-xs mb-1">{t('cycleHistory.periodDays', { defaultValue: 'Period Days' })}</Text>
              <TextInput
                value={periodLength}
                onChangeText={setPeriodLength}
                keyboardType="number-pad"
                className="bg-raised rounded-lg p-2 text-text-primary border border-border-subtle"
              />
            </View>
            <View className="flex-1">
              <Text className="text-text-secondary text-xs mb-1">{t('cycleHistory.cycleDays', { defaultValue: 'Cycle Days' })}</Text>
              <TextInput
                value={cycleLength}
                onChangeText={setCycleLength}
                keyboardType="number-pad"
                className="bg-raised rounded-lg p-2 text-text-primary border border-border-subtle"
              />
            </View>
          </View>

          <View className="flex-row justify-between items-center py-2">
            <Text className="text-text-primary text-sm">{t('cycleHistory.excludeFromPredictions', { defaultValue: 'Exclude from predictions' })}</Text>
            <Switch
              value={isExcluded}
              onValueChange={setIsExcluded}
            />
          </View>

          <Button variant="primary" onPress={handleAdd}>
            {t('cycleHistory.saveManual', { defaultValue: 'Save Manual Cycle' })}
          </Button>
        </View>
      )}

      {cycles.length === 0 ? (
        <View className="bg-surface rounded-xl p-4 border-0 shadow-sm items-center">
          <Text className="text-text-secondary text-sm">{t('cycleHistory.empty', { defaultValue: 'No logged cycles yet.' })}</Text>
        </View>
      ) : (
        <View className="bg-surface rounded-xl border-0 shadow-sm overflow-hidden">
          {cycles.map((c, idx) => (
            <SwipeableDeleteRow
              key={c.id || c.start_date}
              title={t('cycleHistory.startedAccessibility', { defaultValue: 'Cycle started {{date}}', date: c.start_date })}
              onConfirmDelete={() => c.id && deleteCycle(c.id)}
              className={`p-3.5 ${idx < cycles.length - 1 ? 'border-b border-border-subtle' : ''}`}
            >
              <Text className="text-text-primary font-semibold text-sm">
                {t('cycleHistory.started', { defaultValue: 'Started {{date}}', date: c.start_date })}
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                {c.cycle_length ? t('cycleHistory.dayCycle', { defaultValue: '{{count}} day cycle', count: c.cycle_length }) : t('cycleHistory.currentCycle', { defaultValue: 'Current cycle' })} • {t('cycleHistory.dayPeriod', { defaultValue: '{{count}} day periods', defaultValue_one: '{{count}} day period', defaultValue_other: '{{count}} day periods', count: c.period_length || 5 })}
              </Text>
              {c.cycle_length && c.period_length && (
                <View className="mt-2">
                  <CycleBarGlyph
                    cycleLength={c.cycle_length}
                    periodLength={c.period_length}
                    maxLength={maxCycleLength}
                  />
                </View>
              )}
            </SwipeableDeleteRow>
          ))}
        </View>
      )}

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={startDate}
        onSelectDate={setStartDate}
      />
    </View>
  );
};

export default CycleHistoryList;
