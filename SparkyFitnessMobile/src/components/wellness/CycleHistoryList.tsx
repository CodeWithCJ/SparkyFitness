import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Switch, TextInput } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useCycleHistory } from '../../hooks/useCycleHistory';
import CycleBarGlyph from './CycleBarGlyph';
import Icon from '../Icon';
import Button from '../ui/Button';
import CalendarSheet, { type CalendarSheetRef } from '../CalendarSheet';
import { getTodayDate, formatDate } from '../../utils/dateUtils';

const CycleHistoryList: React.FC = () => {
  const { cycles, createCycle, deleteCycle } = useCycleHistory();
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
        <Text className="text-text-primary text-base font-bold">Cycle History</Text>
        <TouchableOpacity
          onPress={() => setShowAddForm(!showAddForm)}
          className="flex-row items-center"
        >
          <Icon name={showAddForm ? 'close' : 'add'} size={18} color={accentColor} />
          <Text className="font-semibold text-sm ml-1" style={{ color: accentColor }}>
            {showAddForm ? 'Cancel' : 'Add Manual'}
          </Text>
        </TouchableOpacity>
      </View>

      {showAddForm && (
        <View className="bg-surface rounded-xl p-4 border border-border-subtle gap-3">
          <Text className="text-text-primary font-semibold text-sm">Log Manual Cycle</Text>
          
          <View>
            <Text className="text-text-secondary text-xs mb-1">Start Date</Text>
            <TouchableOpacity
              onPress={() => calendarSheetRef.current?.present()}
              className="bg-raised rounded-lg p-2.5 text-text-primary border border-border-subtle flex-row justify-between items-center"
            >
              <Text className="text-text-primary">
                {startDate ? formatDate(startDate) : 'Select Date'}
              </Text>
              <Icon name="calendar" size={18} color={accentColor} />
            </TouchableOpacity>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-text-secondary text-xs mb-1">Period Days</Text>
              <TextInput
                value={periodLength}
                onChangeText={setPeriodLength}
                keyboardType="number-pad"
                className="bg-raised rounded-lg p-2 text-text-primary border border-border-subtle"
              />
            </View>
            <View className="flex-1">
              <Text className="text-text-secondary text-xs mb-1">Cycle Days</Text>
              <TextInput
                value={cycleLength}
                onChangeText={setCycleLength}
                keyboardType="number-pad"
                className="bg-raised rounded-lg p-2 text-text-primary border border-border-subtle"
              />
            </View>
          </View>

          <View className="flex-row justify-between items-center py-2">
            <Text className="text-text-primary text-sm">Exclude from predictions</Text>
            <Switch
              value={isExcluded}
              onValueChange={setIsExcluded}
            />
          </View>

          <Button variant="primary" onPress={handleAdd}>
            Save Manual Cycle
          </Button>
        </View>
      )}

      {cycles.length === 0 ? (
        <View className="bg-surface rounded-xl p-4 border border-border-subtle items-center">
          <Text className="text-text-secondary text-sm">No logged cycles yet.</Text>
        </View>
      ) : (
        <View className="gap-3">
          {cycles.map((c) => (
            <View
              key={c.id || c.start_date}
              className="bg-surface rounded-xl p-3 border border-border-subtle flex-row justify-between items-center"
            >
              <View className="flex-1 mr-4">
                <Text className="text-text-primary font-semibold text-sm">
                  Started {c.start_date}
                </Text>
                <Text className="text-text-secondary text-xs mt-1">
                  {c.cycle_length ? `${c.cycle_length} day cycle` : 'Current cycle'} • {c.period_length || 5} day period
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
                className="p-2 bg-red-50 rounded-full"
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
