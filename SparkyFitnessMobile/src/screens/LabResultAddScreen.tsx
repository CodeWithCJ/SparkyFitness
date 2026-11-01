import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import {
  LAB_MARKER_PRESETS,
  hasSexSpecificRange,
  type LabMarkerPreset,
} from '@workspace/shared';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import { FooterSaveBar } from '../components/FormScreenChrome';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useLabMarkers, useSaveLabResult } from '../hooks/useLabResults';
import { useProfile } from '../hooks/useProfile';
import {
  formatDateLabel,
  getDateRelationToToday,
  getTodayDate,
} from '../utils/dateUtils';
import { useLabMarkerLabels } from '../utils/labMarkerLabels';
import {
  buildLabPickerOptions,
  dropStalePrefilledRange,
  effectiveLabRange,
  type LabFormPrefill,
  labMarkerQueryFromId,
  labPresetDefaults,
  labPresetName,
  labSexFromGender,
  parseLabValue,
  parseRangeBound,
  type LabMarker,
} from '../utils/labResults';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'LabResultAdd'>;

const PICKER_LIMIT = 40;
const INPUT_CLASS =
  'bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary';

/** A chosen marker: a built-in one, one of the user's own, or a new custom one. */
type Selection =
  | { kind: 'builtin'; key: string }
  | { kind: 'custom'; id: string }
  | { kind: 'new'; name: string };

const rangeText = (bound: number | null) =>
  bound !== null ? String(bound) : '';

/** The range a result for this marker starts from: its latest result's, else the marker's. */
const startingRange = (marker: LabMarker) =>
  effectiveLabRange(marker.latest, marker);

const LabResultAddScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const calendarRef = useRef<CalendarSheetRef>(null);

  const { markers, isLoading: markersLoading } = useLabMarkers();
  const labels = useLabMarkerLabels();
  const save = useSaveLabResult();
  const { profile, isLoading: profileLoading } = useProfile();
  const sex = labSexFromGender(profile?.gender);

  const presetMarkerId = route.params?.marker;
  const presetQuery = presetMarkerId
    ? labMarkerQueryFromId(presetMarkerId)
    : null;
  const [selection, setSelection] = useState<Selection | null>(
    presetQuery
      ? 'markerKey' in presetQuery
        ? { kind: 'builtin', key: presetQuery.markerKey }
        : { kind: 'custom', id: presetQuery.markerId }
      : null
  );
  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState('');
  const [lowText, setLowText] = useState('');
  const [highText, setHighText] = useState('');
  const [valueText, setValueText] = useState('');
  const [date, setDate] = useState(getTodayDate());
  const [notes, setNotes] = useState('');

  const preset: LabMarkerPreset | undefined =
    selection?.kind === 'builtin'
      ? LAB_MARKER_PRESETS.find((p) => p.key === selection.key)
      : undefined;
  const customMarker =
    selection?.kind === 'custom'
      ? markers.find((m) => m.markerId === selection.id)
      : undefined;

  // What the form filled in last, so a range left over from another unit can
  // be told apart from one the person typed.
  const prefill = useRef<LabFormPrefill | null>(null);

  const applyDefaults = (next: {
    unit: string;
    low: number | null;
    high: number | null;
  }) => {
    const filled = {
      unit: next.unit,
      low: rangeText(next.low),
      high: rangeText(next.high),
    };
    prefill.current = filled;
    setUnit(filled.unit);
    setLowText(filled.low);
    setHighText(filled.high);
  };

  // Changing the unit of a range the form filled in invalidates that range.
  const settledRange = dropStalePrefilledRange(
    { unit, low: lowText, high: highText },
    prefill.current,
    selection?.kind === 'builtin' ? selection.key : null
  );
  const handleUnitCommitted = () => {
    const base = prefill.current;
    const edited =
      base !== null && (lowText !== base.low || highText !== base.high);
    setLowText(settledRange.low);
    setHighText(settledRange.high);
    // A range the person edited is theirs from here on, so it must never be
    // taken for the form's own fill-in on a later unit change.
    prefill.current = edited ? null : { unit, ...settledRange };
  };

  const chooseBuiltin = (chosen: LabMarkerPreset) => {
    setSelection({ kind: 'builtin', key: chosen.key });
    const earlier = markers.find((m) => m.markerKey === chosen.key);
    if (earlier?.latest) {
      const range = startingRange(earlier);
      applyDefaults({
        unit: earlier.latest.unit || chosen.unit,
        low: range.low,
        high: range.high,
      });
      return;
    }
    const defaults = labPresetDefaults(chosen, sex);
    applyDefaults({
      unit: defaults.unit,
      low: defaults.ref_range_low,
      high: defaults.ref_range_high,
    });
  };

  const chooseCustom = (chosen: LabMarker) => {
    if (chosen.markerId === null) return;
    setSelection({ kind: 'custom', id: chosen.markerId });
    const range = startingRange(chosen);
    applyDefaults({ unit: chosen.unit, low: range.low, high: range.high });
  };

  // Opened for a marker (from its detail screen): fill the form once it is known.
  // Wait for the markers and the profile: the latest result and the sex that
  // picks the range are not known until they arrive, and a form filled in
  // without them would keep a range that is wrong for this person.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !presetQuery) return;
    if (markersLoading || profileLoading) return;
    if ('markerKey' in presetQuery) {
      const found = LAB_MARKER_PRESETS.find(
        (p) => p.key === presetQuery.markerKey
      );
      if (found) {
        prefilled.current = true;
        chooseBuiltin(found);
      }
    } else {
      const found = markers.find((m) => m.markerId === presetQuery.markerId);
      if (found) {
        prefilled.current = true;
        chooseCustom(found);
      }
    }
    // chooseBuiltin / chooseCustom only set state from `markers` and `sex`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, sex, markersLoading, profileLoading]);

  const options = useMemo(
    () => buildLabPickerOptions(markers, search, labels),
    [markers, search, labels]
  );

  const customName = search.trim();
  const canCreateCustom =
    customName !== '' &&
    !markers.some(
      (m) =>
        m.markerId !== null && m.name.toLowerCase() === customName.toLowerCase()
    ) &&
    !LAB_MARKER_PRESETS.some(
      (p) => labPresetName(p, labels).toLowerCase() === customName.toLowerCase()
    );
  const isNew = selection?.kind === 'new';
  const sexSpecificHint = preset !== undefined && hasSexSpecificRange(preset);

  const markerTitle =
    selection?.kind === 'builtin'
      ? preset
        ? labPresetName(preset, labels)
        : ''
      : selection?.kind === 'custom'
        ? (customMarker?.name ?? '')
        : selection?.kind === 'new'
          ? selection.name
          : '';

  // A custom marker can read below zero (a T-score, base excess), and the
  // decimal pad has no minus key on iOS.
  const numberKeyboard =
    selection?.kind === 'builtin' ? 'decimal-pad' : 'numbers-and-punctuation';

  const value = parseLabValue(valueText);
  const low = parseRangeBound(settledRange.low);
  const high = parseRangeBound(settledRange.high);
  const rangeValid =
    low.ok &&
    high.ok &&
    (low.value === null || high.value === null || low.value <= high.value);
  const dateValid = getDateRelationToToday(date) !== 'future';
  const markerKnown =
    selection?.kind === 'builtin'
      ? preset !== undefined
      : selection?.kind === 'custom'
        ? customMarker !== undefined
        : selection !== null;
  const canSave =
    markerKnown &&
    value !== null &&
    dateValid &&
    rangeValid &&
    (!isNew || unit.trim() !== '') &&
    !save.isPending;

  const handleSave = async () => {
    if (!canSave || selection === null || value === null) return;
    try {
      await save.mutateAsync({
        target:
          selection.kind === 'builtin'
            ? { markerKey: selection.key }
            : selection.kind === 'custom'
              ? { markerId: selection.id }
              : { newMarkerName: selection.name },
        value,
        unit: unit.trim(),
        ref_range_low: low.ok ? low.value : null,
        ref_range_high: high.ok ? high.value : null,
        date,
        notes,
      });
      navigation.goBack();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('labs.saveFailed', {
          defaultValue: 'Could not save the lab result',
        }),
      });
    }
  };

  const header = useScreenHeader({
    title: t('screens.labResultAdd', { defaultValue: 'Add lab result' }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      accessibilityLabel: t('common.cancel', { defaultValue: 'Cancel' }),
    },
    right: [
      {
        kind: 'primary',
        label: t('common.save', { defaultValue: 'Save' }),
        onPress: handleSave,
        busy: save.isPending,
        disabled: !canSave,
        placement: 'native-only',
        identifier: 'lab-result-save',
      },
    ],
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1 px-4 py-3"
        contentContainerClassName="gap-4 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        {selection === null ? (
          <View className="gap-3">
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('labs.searchPlaceholder', {
                defaultValue: 'Search markers (HbA1c, LDL, ...)',
              })}
              placeholderTextColor={textMuted}
              autoCorrect={false}
              className={INPUT_CLASS}
              accessibilityLabel={t('labs.searchPlaceholder', {
                defaultValue: 'Search markers (HbA1c, LDL, ...)',
              })}
            />
            <View className="bg-surface rounded-xl overflow-hidden">
              {canCreateCustom && (
                <TouchableOpacity
                  onPress={() => {
                    setSelection({ kind: 'new', name: customName });
                    applyDefaults({ unit: '', low: null, high: null });
                  }}
                  className="px-4 py-3.5 border-b border-border-subtle"
                  accessibilityRole="button"
                >
                  <Text className="text-base font-semibold text-accent-primary">
                    {t('labs.createCustom', {
                      defaultValue: 'Add "{{name}}" as a new marker',
                      name: customName,
                    })}
                  </Text>
                </TouchableOpacity>
              )}
              {options.slice(0, PICKER_LIMIT).map((option, index) => {
                const key =
                  option.kind === 'custom'
                    ? option.marker.id
                    : `preset-${option.preset.key}`;
                const title =
                  option.kind === 'custom'
                    ? option.marker.name
                    : labPresetName(option.preset, labels);
                const unitLabel =
                  option.kind === 'custom'
                    ? option.marker.unit
                    : option.preset.unit;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() =>
                      option.kind === 'custom'
                        ? chooseCustom(option.marker)
                        : chooseBuiltin(option.preset)
                    }
                    className={`px-4 py-3 flex-row items-center justify-between ${
                      index > 0 || canCreateCustom
                        ? 'border-t border-border-subtle'
                        : ''
                    }`}
                    accessibilityRole="button"
                  >
                    <Text className="text-base text-text-primary flex-1 mr-3">
                      {title}
                    </Text>
                    <Text className="text-xs text-text-muted">{unitLabel}</Text>
                  </TouchableOpacity>
                );
              })}
              {options.length === 0 && !canCreateCustom && (
                <Text className="px-4 py-3.5 text-sm text-text-muted">
                  {t('labs.noMatches', { defaultValue: 'No matching markers' })}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <>
            <View className="flex-row items-center justify-between">
              <Text className="text-text-primary text-lg font-bold flex-1 mr-3">
                {markerTitle}
              </Text>
              {!presetMarkerId && (
                <TouchableOpacity
                  onPress={() => setSelection(null)}
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-accent-primary">
                    {t('labs.changeMarker', { defaultValue: 'Change' })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                {t('labs.value', { defaultValue: 'Result' })}
              </Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={valueText}
                  onChangeText={setValueText}
                  keyboardType={numberKeyboard}
                  placeholder="0"
                  placeholderTextColor={textMuted}
                  className={`${INPUT_CLASS} flex-1`}
                  accessibilityLabel={t('labs.value', {
                    defaultValue: 'Result',
                  })}
                />
                <TextInput
                  value={unit}
                  onChangeText={setUnit}
                  onEndEditing={handleUnitCommitted}
                  placeholder={t('labs.unit', { defaultValue: 'Unit' })}
                  placeholderTextColor={textMuted}
                  autoCapitalize="none"
                  className={`${INPUT_CLASS} w-28`}
                  accessibilityLabel={t('labs.unit', {
                    defaultValue: 'Unit',
                  })}
                />
              </View>
            </View>

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                {t('labs.rangeOptional', {
                  defaultValue: 'Reference range (optional)',
                })}
              </Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={lowText}
                  onChangeText={setLowText}
                  keyboardType={numberKeyboard}
                  placeholder={t('labs.rangeLow', { defaultValue: 'Low' })}
                  placeholderTextColor={textMuted}
                  className={`${INPUT_CLASS} flex-1`}
                  accessibilityLabel={t('labs.rangeLow', {
                    defaultValue: 'Low',
                  })}
                />
                <TextInput
                  value={highText}
                  onChangeText={setHighText}
                  keyboardType={numberKeyboard}
                  placeholder={t('labs.rangeHigh', { defaultValue: 'High' })}
                  placeholderTextColor={textMuted}
                  className={`${INPUT_CLASS} flex-1`}
                  accessibilityLabel={t('labs.rangeHigh', {
                    defaultValue: 'High',
                  })}
                />
              </View>
              <Text className="text-xs text-text-muted">
                {t('labs.rangeFromReport', {
                  defaultValue:
                    'Use the range printed on your report. It is saved with this result.',
                })}
              </Text>
              {sexSpecificHint && (
                <Text className="text-xs text-text-muted">
                  {sex
                    ? t('labs.rangeForSex', {
                        defaultValue:
                          'Prefilled for {{sex}} adults from your profile. Labs differ, so edit it to match your report.',
                        sex:
                          sex === 'male'
                            ? t('labs.sex.male', { defaultValue: 'male' })
                            : t('labs.sex.female', {
                                defaultValue: 'female',
                              }),
                      })
                    : t('labs.rangeNoSex', {
                        defaultValue:
                          'This marker differs by sex. Set your sex in your profile for a tailored range, or enter the range from your report.',
                      })}
                </Text>
              )}
              {!rangeValid && (
                <Text className="text-xs text-text-danger-subtle">
                  {t('labs.rangeInvalid', {
                    defaultValue:
                      'Enter numbers, with the low value not above the high value.',
                  })}
                </Text>
              )}
            </View>

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                {t('labs.date', { defaultValue: 'Date of test' })}
              </Text>
              <TouchableOpacity
                onPress={() => calendarRef.current?.present()}
                className="flex-row items-center px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11"
                accessibilityRole="button"
                accessibilityLabel={t('labs.date', {
                  defaultValue: 'Date of test',
                })}
              >
                <Text className="text-base text-text-primary">
                  {formatDateLabel(date, t, dateLocale)}
                </Text>
              </TouchableOpacity>
              {!dateValid && (
                <Text className="text-xs text-text-danger-subtle">
                  {t('labs.dateFuture', {
                    defaultValue: 'The test date cannot be in the future.',
                  })}
                </Text>
              )}
            </View>

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('labs.notesPlaceholder', {
                defaultValue: 'Add a note (optional)',
              })}
              placeholderTextColor={textMuted}
              multiline
              textAlignVertical="top"
              className={`${INPUT_CLASS} min-h-20`}
            />
          </>
        )}
      </ScrollView>
      {selection !== null && !usesNativeHeader && (
        <FooterSaveBar
          onPress={handleSave}
          busy={save.isPending}
          disabled={!canSave}
        />
      )}
      <CalendarSheet
        ref={calendarRef}
        selectedDate={date}
        onSelectDate={(d) => {
          setDate(d);
          calendarRef.current?.dismiss();
        }}
      />
    </View>
  );
};

export default LabResultAddScreen;
