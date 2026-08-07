import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { useCycleLog } from '../../hooks/useCycleLogs';
import { useUpsertCycleLog } from '../../hooks/useUpsertCycleLog';
import { useCycleMode } from '../../hooks/useCycleMode';
import { useSymptomEntries, useSymptomMutations } from '../../hooks/useSymptoms';
import type { SymptomEntry } from '../../services/api/symptomsApi';
import { useMeasurements } from '../../hooks/useMeasurements';
import { useUpsertCheckIn } from '../../hooks/useUpsertCheckIn';
import { usePreferences } from '../../hooks/usePreferences';
import { weightFromKg, weightToKg } from '../../utils/unitConversions';
import { upsertBbt } from '../../services/api/cycleApi';
import { addLog } from '../../services/LogService';
import CycleIcon from './CycleIcon';
import CycleSymptomPicker from './CycleSymptomPicker';
import Button from '../ui/Button';
import FormInput from '../FormInput';
import DateSelectRow from '../DateSelectRow';
import { useCSSVariable } from 'uniwind';
import BottomSheetPicker from '../BottomSheetPicker';
import type { CycleSymptomDef, FlowLevel } from '@workspace/shared';

interface CycleTodayViewProps {
  date: string;
  onSaveSuccess?: () => void;
  /** Parent-triggered save: the view assigns its save handler to this ref. */
  saveRequestRef?: React.MutableRefObject<(() => void) | null>;
  /** Reports saving state so a parent-owned save button can mirror it. */
  onSavingChange?: (saving: boolean) => void;
  /** Opens the parent's calendar sheet from the in-form date row (pregnancy). */
  onDatePress?: () => void;
  hideSaveButton?: boolean;
}

const FLOW_OPTIONS: { value: FlowLevel; icon: string }[] = [
  { value: 'none', icon: 'flow-none' },
  { value: 'spotting', icon: 'flow-spotting' },
  { value: 'light', icon: 'flow-light' },
  { value: 'medium', icon: 'flow-medium' },
  { value: 'heavy', icon: 'flow-heavy' },
];

// Both fields are optional, so each picker leads with an empty value the save
// handler maps back to null.
const MUCUS_OPTIONS = [
  { value: '' }, { value: 'dry' }, { value: 'sticky' }, { value: 'creamy' }, { value: 'watery' }, { value: 'eggwhite' },
];

const CERVICAL_POSITION_OPTIONS = [
  { value: '' }, { value: 'low' }, { value: 'medium' }, { value: 'high' },
];

const flowLabel = (value: FlowLevel, t: (key: string) => string): string => {
  switch (value) {
    case 'none': return t('mobileComponents.wellness.flow.none');
    case 'spotting': return t('mobileComponents.wellness.flow.spotting');
    case 'light': return t('mobileComponents.wellness.flow.light');
    case 'medium': return t('mobileComponents.wellness.flow.medium');
    case 'heavy': return t('mobileComponents.wellness.flow.heavy');
  }
};
const mucusLabel = (value: string, t: (key: string) => string): string => {
  switch (value) {
    case 'dry': return t('mobileComponents.wellness.mucus.dry');
    case 'sticky': return t('mobileComponents.wellness.mucus.sticky');
    case 'creamy': return t('mobileComponents.wellness.mucus.creamy');
    case 'watery': return t('mobileComponents.wellness.mucus.watery');
    case 'eggwhite': return t('mobileComponents.wellness.mucus.eggwhite');
    default: return t('mobileComponents.wellness.flow.none');
  }
};
const positionLabel = (value: string, t: (key: string) => string): string => {
  switch (value) {
    case 'low': return t('mobileComponents.wellness.position.low');
    case 'medium': return t('mobileComponents.wellness.position.medium');
    case 'high': return t('mobileComponents.wellness.position.high');
    default: return t('mobileComponents.wellness.flow.none');
  }
};

const CycleTodayView: React.FC<CycleTodayViewProps> = ({
  date,
  onSaveSuccess,
  saveRequestRef,
  onSavingChange,
  onDatePress,
  hideSaveButton = false,
}) => {
  const { t } = useTranslation();
  const { log, isLoading, refetch } = useCycleLog({ date });
  const { upsertLogAsync, isSaving } = useUpsertCycleLog();
  const { mode } = useCycleMode();
  const isTtc = mode === 'ttc';
  const isPregnant = mode === 'pregnant';
  const { measurements } = useMeasurements({ date, enabled: isPregnant });
  const upsertCheckIn = useUpsertCheckIn();
  const { entries: symptomEntries, isLoading: isSymptomsLoading } = useSymptomEntries({
    fromDate: date,
    toDate: date,
  });
  const { createEntryAsync, deleteEntryAsync } = useSymptomMutations(date, date);
  const { preferences } = usePreferences();
  const weightUnit: 'kg' | 'lbs' = preferences?.default_weight_unit === 'lbs' ? 'lbs' : 'kg';
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  // Local draft state
  const [flowLevel, setFlowLevel] = useState<FlowLevel | null>(null);
  const [mucus, setMucus] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [bbt, setBbt] = useState('');
  const [intercourse, setIntercourse] = useState<boolean | null>(null);
  const [intercourseProtected, setIntercourseProtected] = useState<boolean | null>(null);
  const [cervicalPosition, setCervicalPosition] = useState<string | null>(null);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [weight, setWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isNotesFocused, setIsNotesFocused] = useState(false);

  const hydratedWeight =
    measurements?.weight != null
      ? String(Math.round(weightFromKg(measurements.weight, weightUnit) * 10) / 10)
      : '';

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

  // Hydrate the weight field only while the user hasn't typed in it, so a
  // background measurements refetch can't overwrite an in-progress edit.
  const weightDirtyRef = useRef(false);
  useEffect(() => {
    weightDirtyRef.current = false;
  }, [date]);
  useEffect(() => {
    if (isPregnant && !weightDirtyRef.current) setWeight(hydratedWeight);
  }, [isPregnant, hydratedWeight]);

  const handleWeightChange = (text: string) => {
    weightDirtyRef.current = text.trim() !== hydratedWeight;
    setWeight(text);
  };

  useEffect(() => {
    const names = symptomEntries
      .filter((e) => e.source === 'cycle')
      .map((e) => e.symptom_name_snapshot);
    // The hook falls back to a fresh [] while entries load, so keep the
    // previous reference when content is unchanged or this effect loops.
    setSelectedSymptoms((prev) =>
      prev.length === names.length && prev.every((n, i) => n === names[i]) ? prev : names
    );
  }, [symptomEntries]);

  const handleToggleSymptom = (symptom: CycleSymptomDef) => {
    const name = symptom.displayName.toLowerCase();
    setSelectedSymptoms((prev) =>
      prev.some((s) => s.toLowerCase() === name)
        ? prev.filter((s) => s.toLowerCase() !== name)
        : [...prev, symptom.displayName]
    );
  };

  const handleSave = async () => {
    // Validate numeric inputs before any write so bad input can't leave a
    // partially-saved entry behind.
    const bbtVal = bbt.trim() ? parseFloat(bbt) : null;
    if (bbt.trim() && isNaN(bbtVal as number)) {
      Toast.show({ type: 'error', text1: t('mobileComponents.wellness.today.invalidTemperature') });
      return;
    }
    // Save weight only when the field was edited to a new value. An emptied
    // field preserves the stored check-in (weight may come from health sync);
    // clearing it belongs to the measurements screen.
    const weightEdited = isPregnant && weight.trim() !== '' && weight.trim() !== hydratedWeight;
    const weightVal = weightEdited ? parseFloat(weight) : null;
    if (weightEdited && isNaN(weightVal as number)) {
      Toast.show({ type: 'error', text1: t('measurementsCopy.invalid', { label: t('measurementsCopy.weight') }) });
      return;
    }

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

      // 2. Sync symptom selections: create toggled-on entries the server
      // doesn't have yet and delete toggled-off ones it still has.
      const selectedLower = selectedSymptoms.map((s) => s.toLowerCase());
      const existingCycleEntries = symptomEntries.filter((e) => e.source === 'cycle');
      const symptomsToDelete = existingCycleEntries.filter(
        (e): e is SymptomEntry & { id: string } =>
          typeof e.id === 'string' &&
          !selectedLower.includes(e.symptom_name_snapshot.toLowerCase())
      );
      const symptomsToCreate = selectedSymptoms.filter(
        (name) =>
          !existingCycleEntries.some(
            (e) => e.symptom_name_snapshot.toLowerCase() === name.toLowerCase()
          )
      );
      await Promise.all([
        ...symptomsToDelete.map((e) => deleteEntryAsync(e.id)),
        ...symptomsToCreate.map((name) =>
          createEntryAsync({
            symptom_name_snapshot: name,
            severity: 3,
            source: 'cycle',
            entry_date: date,
          })
        ),
      ]);

      // 3. Save BBT custom measurement if input is present/changed
      await upsertBbt(date, bbtVal);

      // 4. Pregnancy vitals
      if (weightEdited && weightVal != null) {
        await upsertCheckIn.mutateAsync({
          entryDate: date,
          weight: weightToKg(weightVal, weightUnit),
        });
        weightDirtyRef.current = false;
      }

      // Refetch to pull latest server-hydrated BBT
      refetch();
      onSaveSuccess?.();
    } catch (error) {
      addLog(`Failed to save cycle daily view: ${error}`, 'ERROR');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!saveRequestRef) return;
    saveRequestRef.current = handleSave;
    return () => {
      saveRequestRef.current = null;
    };
  });

  const saving = isSaving || submitting;
  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  if (isLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  return (
    <View className="gap-4">
      {/* Period / Flow Selector — Only for non-pregnant cycle tracking */}
      {!isPregnant && (
      <View className="bg-surface rounded-xl p-4 shadow-sm border-0">
           <Text className="text-text-primary text-sm font-semibold mb-3">{t('mobileComponents.wellness.today.flow')}</Text>
          <View className="flex-row justify-between">
            {FLOW_OPTIONS.map((opt) => {
              const isSelected = flowLevel === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setFlowLevel(opt.value)}
                  className={`items-center justify-center rounded-xl p-2 flex-1 mx-1 border ${
                    isSelected ? 'bg-accent-primary/10 border-accent-primary' : 'bg-raised border-transparent'
                  }`}
                >
                  <CycleIcon id={opt.icon} size={24} />
                  <Text className={`text-xs mt-1 font-medium ${isSelected ? 'text-text-primary font-bold' : 'text-text-secondary'}`}>
                     {flowLabel(opt.value, t)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Date & Weight — Only for pregnancy tracking */}
      {isPregnant && (
        <View className="bg-surface rounded-xl p-4 shadow-sm border-0 gap-4">
          {onDatePress && <DateSelectRow date={date} onPress={onDatePress} />}
          <View>
            <Text className="text-text-primary text-sm font-semibold mb-2">
               {t('measurementsCopy.weight')} ({weightUnit})
            </Text>
            <FormInput
              value={weight}
              onChangeText={handleWeightChange}
              placeholder={weightUnit === 'lbs' ? 'e.g. 143' : 'e.g. 65'}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      )}

      {/* Symptoms */}
      <View className="bg-surface rounded-xl p-4 shadow-sm border-0">
        <CycleSymptomPicker
          selected={selectedSymptoms}
          onToggle={handleToggleSymptom}
          loading={isSymptomsLoading}
        />
      </View>

      {/* Cervical Mucus — Bottom Sheet Picker */}
      {!isPregnant && (
        <View className="bg-surface rounded-xl p-4 shadow-sm border-0 gap-2">
             <Text className="text-text-primary text-sm font-semibold">{t('mobileComponents.wellness.today.mucus')}</Text>
          <BottomSheetPicker
             title={t('mobileComponents.wellness.today.selectMucus')}
             options={MUCUS_OPTIONS.map((option) => ({ ...option, label: mucusLabel(option.value, t) }))}
            value={mucus || ''}
            onSelect={(value) => setMucus(value || null)}
             placeholder={t('mobileComponents.wellness.today.selectPlaceholder')}
          />
        </View>
      )}

      {/* TTC: Intercourse + Cervical Position */}
      {isTtc && (
        <View className="bg-surface rounded-xl p-4 shadow-sm border-0 gap-4">
          <View>
             <Text className="text-text-primary text-sm font-semibold mb-3">{t('mobileComponents.wellness.today.intercourse')}</Text>
            <View className="flex-row gap-2">
              {[
                { label: t('mobileComponents.wellness.flow.none'), val: null as boolean | null },
                { label: t('mobileComponents.wellness.binary.yes'), val: true },
                { label: t('mobileComponents.wellness.binary.no'), val: false },
              ].map((opt) => {
                const isSelected = intercourse === opt.val;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    onPress={() => setIntercourse(opt.val)}
                    className={`rounded-full px-4 py-2 border ${
                      isSelected ? 'bg-accent-primary/10 border-accent-primary' : 'bg-raised border-transparent'
                    }`}
                  >
                    <Text className={`text-xs font-semibold ${isSelected ? 'text-text-primary font-bold' : 'text-text-secondary'}`}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {intercourse === true && (
            <View>
               <Text className="text-text-primary text-sm font-semibold mb-3">{t('mobileComponents.wellness.today.protection')}</Text>
              <View className="flex-row gap-2">
                {[
                   { label: t('mobileComponents.wellness.binary.protected'), val: true },
                   { label: t('mobileComponents.wellness.binary.unprotected'), val: false },
                ].map((opt) => {
                  const isSelected = intercourseProtected === opt.val;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      onPress={() => setIntercourseProtected(opt.val)}
                      className={`rounded-full px-4 py-2 border ${
                        isSelected ? 'bg-accent-primary/10 border-accent-primary' : 'bg-raised border-transparent'
                      }`}
                    >
                      <Text className={`text-xs font-semibold ${isSelected ? 'text-text-primary font-bold' : 'text-text-secondary'}`}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View className="gap-2">
            <Text className="text-text-primary text-sm font-semibold">{t('mobileComponents.wellness.today.position')}</Text>
            <BottomSheetPicker
              title={t('mobileComponents.wellness.today.selectPosition')}
               options={CERVICAL_POSITION_OPTIONS.map((option) => ({ ...option, label: positionLabel(option.value, t) }))}
              value={cervicalPosition || ''}
              onSelect={(value) => setCervicalPosition(value || null)}
              placeholder={t('mobileComponents.wellness.today.selectPlaceholder')}
            />
          </View>
        </View>
      )}

      {/* Basal Body Temperature — Only for non-pregnant cycle tracking */}
      {!isPregnant && (
        <View className="bg-surface rounded-xl p-4 shadow-sm border-0">
          <Text className="text-text-primary text-sm font-semibold mb-2">{t('mobileComponents.wellness.today.temperature')}</Text>
          <Text className="text-text-secondary text-xs mb-3">
            {t('mobileComponents.wellness.today.temperatureHelp')}
          </Text>
          <FormInput
            value={bbt}
            onChangeText={setBbt}
            placeholder={t('mobileComponents.wellness.today.temperaturePlaceholder')}
            keyboardType="decimal-pad"
          />
        </View>
      )}

      {/* Notes */}
      <View className="bg-surface rounded-xl p-4 shadow-sm border-0">
        <Text className="text-text-primary text-sm font-semibold mb-2">{t('mobileComponents.wellness.today.notes')}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          onFocus={() => setIsNotesFocused(true)}
          onBlur={() => setIsNotesFocused(false)}
          placeholder={t('mobileComponents.wellness.today.notesPlaceholder')}
          placeholderTextColor={textMuted}
          multiline
          numberOfLines={4}
          className={`bg-raised rounded-xl p-3 text-text-primary text-sm min-h-[80px] border ${
            isNotesFocused ? 'border-accent-primary' : 'border-border-subtle'
          }`}
          style={{ textAlignVertical: 'top' }}
        />
      </View>

      {/* Save Button */}
      {!hideSaveButton && (
        <View className="px-4">
          <Button variant="primary" disabled={saving} onPress={handleSave}>
             {saving ? t('mobileComponents.wellness.today.saving') : t('mobileComponents.wellness.today.save')}
          </Button>
        </View>
      )}
    </View>
  );
};

export default CycleTodayView;
