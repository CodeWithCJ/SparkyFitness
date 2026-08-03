import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Switch, TextInput } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useCycleHistory } from '../../hooks/useCycleHistory';
import CycleBarGlyph from './CycleBarGlyph';
import Icon from '../Icon';
import Button from '../ui/Button';
import CalendarSheet, { type CalendarSheetRef } from '../CalendarSheet';
import { getTodayDate, formatDate } from '../../utils/dateUtils';
import { useTranslation } from 'react-i18next';

const CycleHistoryList: React.FC = () => {
  const { cycles, createCycle, deleteCycle } = useCycleHistory();
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const calendarSheetRef = useRef<CalendarSheetRef>(null);
  const [accentColor, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-danger',
  ]) as [string, string];

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
        <Text className="text-text-primary text-base font-bold">{t('mobileComponents.cycleHistory.title')}</Text>
        <TouchableOpacity
          onPress={() => setShowAddForm(!showAddForm)}
          className="flex-row items-center"
        >
          <Icon name={showAddForm ? 'close' : 'add'} size={18} color={accentColor} />
          <Text className="font-semibold text-sm ml-1" style={{ color: accentColor }}>
            {showAddForm ? t('common.cancel') : t('mobileComponents.cycleHistory.addManual')}
          </Text>
        </TouchableOpacity>
      </View>

      {showAddForm && (
        <View className="bg-surface rounded-xl p-4 border-0 shadow-sm gap-3">
          <Text className="text-text-primary font-semibold text-sm">{t('mobileComponents.cycleHistory.logManual')}</Text>
          
          <View>
            <Text className="text-text-secondary text-xs mb-1">{t('mobileComponents.cycleHistory.startDate')}</Text>
            <TouchableOpacity
              onPress={() => calendarSheetRef.current?.present()}
              className="bg-raised rounded-lg p-2.5 text-text-primary border border-border-subtle flex-row justify-between items-center"
            >
              <Text className="text-text-primary">
                {startDate ? formatDate(startDate) : t('mobileComponents.cycleHistory.selectDate')}
              </Text>
              <Icon name="calendar" size={18} color={accentColor} />
            </TouchableOpacity>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-text-secondary text-xs mb-1">{t('mobileComponents.cycleHistory.periodDays')}</Text>
              <TextInput
                value={periodLength}
                onChangeText={setPeriodLength}
                keyboardType="number-pad"
                className="bg-raised rounded-lg p-2 text-text-primary border border-border-subtle"
              />
            </View>
            <View className="flex-1">
              <Text className="text-text-secondary text-xs mb-1">{t('mobileComponents.cycleHistory.cycleDays')}</Text>
              <TextInput
                value={cycleLength}
                onChangeText={setCycleLength}
                keyboardType="number-pad"
                className="bg-raised rounded-lg p-2 text-text-primary border border-border-subtle"
              />
            </View>
          </View>

          <View className="flex-row justify-between items-center py-2">
            <Text className="text-text-primary text-sm">{t('mobileComponents.cycleHistory.exclude')}</Text>
            <Switch
              value={isExcluded}
              onValueChange={setIsExcluded}
            />
          </View>

          <Button variant="primary" onPress={handleAdd}>
            {t('mobileComponents.cycleHistory.saveManual')}
          </Button>
        </View>
      )}

      {cycles.length === 0 ? (
        <View className="bg-surface rounded-xl p-4 border-0 shadow-sm items-center">
          <Text className="text-text-secondary text-sm">{t('mobileComponents.cycleHistory.empty')}</Text>
        </View>
      ) : (
        <View className="bg-surface rounded-xl border-0 shadow-sm overflow-hidden">
          {cycles.map((c, idx) => (
            <View
              key={c.id || c.start_date}
              className={`p-3.5 flex-row justify-between items-center ${
                idx < cycles.length - 1 ? 'border-b border-border-subtle' : ''
              }`}
            >
              <View className="flex-1 mr-4">
                <Text className="text-text-primary font-semibold text-sm">
                  {t('mobileComponents.cycleHistory.started', { date: formatDate(c.start_date) })}
                </Text>
                <Text className="text-text-secondary text-xs mt-1">
                  {c.cycle_length
                    ? t('mobileComponents.cycleHistory.dayCycle', { count: c.cycle_length })
                    : t('mobileComponents.cycleHistory.currentCycle')} • {t('mobileComponents.cycleHistory.dayPeriod', { count: c.period_length || 5 })}
                </Text>
                {c.cycle_length && c.period_length && (
                  <View className="mt-2">
                    <CycleBarGlyph
                      cycleLength={c.cycle_length}
                      periodLength={c.period_length}
                    />
                  </View>
                )}
              </View>

              <TouchableOpacity
                onPress={() => c.id && deleteCycle(c.id)}
                className="p-2 bg-surface rounded-full border border-border-subtle"
              >
                <Icon name="trash" size={16} color={dangerColor} />
              </TouchableOpacity>
            </View>
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
