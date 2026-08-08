import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import DateTimePicker, { type DateType } from 'react-native-ui-datepicker';
import { toHourMinute } from '@workspace/shared';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import Switch from './ui/Switch';
import Button from './ui/Button';
import type { MealType } from '../types/mealTypes';

export interface MealTypeFormSheetRef {
  presentAdd: () => void;
  presentEdit: (mealType: MealType) => void;
  dismiss: () => void;
}

export interface MealTypeFormValues {
  name: string;
  defaultTime: string;
  isVisible: boolean;
  showInQuickLog: boolean;
}

interface MealTypeFormSheetProps {
  /** True when the sheet is used for a system type (no name editing, no delete). */
  isSystem?: boolean;
  isSaving?: boolean;
  /** Saves the form. Returns true when the caller should close the sheet. */
  onSave: (values: MealTypeFormValues) => void;
}

const emptyValues: MealTypeFormValues = {
  name: '',
  defaultTime: '',
  isVisible: true,
  showInQuickLog: false,
};

/**
 * Shared Add/Edit form for meal types, presented as a bottom sheet reusing the
 * app's established BottomSheetModal pattern (CopyMealSheet / FastingEditSheet).
 *
 * A single parameterized sheet replaces the previous copy-paste Add/Edit
 * modals. Raw `sort_order` is intentionally NOT editable here — custom ordering
 * is done via drag-and-drop on the settings screen and the backend stores the
 * integer.
 */
const MealTypeFormSheet = forwardRef<MealTypeFormSheetRef, MealTypeFormSheetProps>(
  ({ isSystem = false, isSaving = false, onSave }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const [surfaceBg, textMuted, accentPrimary, textPrimary, textSecondary] =
      useCSSVariable([
        '--color-surface',
        '--color-text-muted',
        '--color-accent-primary',
        '--color-text-primary',
        '--color-text-secondary',
      ]) as [string, string, string, string, string];

    const [values, setValues] = useState<MealTypeFormValues>(emptyValues);
    const [mode, setMode] = useState<'add' | 'edit'>('add');

    useImperativeHandle(ref, () => ({
      presentAdd: () => {
        setMode('add');
        setValues(emptyValues);
        bottomSheetRef.current?.present();
      },
      presentEdit: (mealType) => {
        setMode('edit');
        setValues({
          name: mealType.name,
          defaultTime: toHourMinute(mealType.default_time) || '',
          isVisible: mealType.is_visible,
          showInQuickLog: mealType.show_in_quick_log,
        });
        bottomSheetRef.current?.present();
      },
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useSheetBackdrop();

    const handleDateChange = useCallback(({ date }: { date: DateType }) => {
      if (!date) return;
      let jsDate: Date;
      if (date instanceof Date) {
        jsDate = date;
      } else if (typeof date === 'object' && 'toDate' in date) {
        jsDate = date.toDate();
      } else if (typeof date === 'string') {
        jsDate = new Date(date);
      } else {
        jsDate = new Date(date);
      }
      const hh = String(jsDate.getHours()).padStart(2, '0');
      const mm = String(jsDate.getMinutes()).padStart(2, '0');
      setValues((prev) => ({ ...prev, defaultTime: `${hh}:${mm}` }));
    }, []);

    const timeValue = values.defaultTime
      ? (() => {
          const d = new Date();
          const [h, m] = values.defaultTime.split(':').map(Number);
          d.setHours(h, m, 0, 0);
          return d;
        })()
      : new Date();

    const hasDefaultTime = values.defaultTime !== '';

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        enableContentPanningGesture={Platform.OS !== 'android'}
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
        onDismiss={() => setValues(emptyValues)}
      >
        <BottomSheetScrollView contentContainerClassName="px-5 pb-safe-or-8">
          <Text className="text-text-primary text-lg font-semibold text-center mb-4">
            {mode === 'add' ? 'Add Meal Type' : 'Edit Meal Type'}
          </Text>

          {!isSystem && (
            <>
              <Text className="text-xs font-semibold uppercase text-text-muted mb-1">
                Name
              </Text>
              <TextInput
                value={values.name}
                onChangeText={(name) => setValues((prev) => ({ ...prev, name }))}
                placeholder="e.g. Pre-Workout"
                placeholderTextColor="#9CA3AF"
                className="bg-background border border-border text-text-primary rounded-lg px-3 py-2.5 text-base mb-4"
                autoFocus={mode === 'add'}
                returnKeyType="done"
                accessibilityLabel="Meal type name"
              />
            </>
          )}

          <Text className="text-xs font-semibold uppercase text-text-muted mb-1">
            Default time
          </Text>
          <Text className="text-text-secondary text-sm mb-2">
            Used to suggest this meal type at a given time of day.
          </Text>
          <DateTimePicker
            mode="single"
            date={timeValue}
            timePicker
            initialView="time"
            hideHeader
            onChange={handleDateChange}
            styles={{
              selected: { backgroundColor: accentPrimary },
              selected_label: { color: '#FFFFFF' },
              today: { borderColor: accentPrimary, borderWidth: 1 },
              day_label: { color: textPrimary },
              weekday_label: { color: textSecondary },
              month_selector_label: { color: textPrimary, fontWeight: '600' },
              year_selector_label: { color: textPrimary, fontWeight: '600' },
              disabled_label: { color: textMuted },
              month_label: { color: textPrimary },
              year_label: { color: textPrimary },
              selected_month: { backgroundColor: accentPrimary },
              selected_month_label: { color: '#FFFFFF' },
              selected_year: { backgroundColor: accentPrimary },
              selected_year_label: { color: '#FFFFFF' },
              time_label: { color: textPrimary },
            }}
          />
          <View className="mt-1 mb-3 rounded-lg border border-border-subtle px-3 py-2 flex-row items-center justify-between">
            <Text className="text-sm text-text-primary">Selected</Text>
            <Text className="text-sm font-semibold" style={{ color: accentPrimary }}>
              {toHourMinute(values.defaultTime || null) || '—'}
            </Text>
          </View>
          {hasDefaultTime && (
            <Button
              variant="secondary"
              onPress={() => setValues((prev) => ({ ...prev, defaultTime: '' }))}
              className="mb-4"
              accessibilityLabel="Clear default time"
            >
              Clear time
            </Button>
          )}

          <View className="flex-row justify-between items-center py-3 border-t border-border-subtle">
            <Text className="text-base font-medium text-text-primary flex-shrink">
              Visible
            </Text>
            <Switch
              value={values.isVisible}
              onValueChange={(val) => setValues((prev) => ({ ...prev, isVisible: val }))}
              accessibilityLabel="Visible"
            />
          </View>
          <View className="flex-row justify-between items-center py-3 border-t border-border-subtle">
            <Text className="text-base font-medium text-text-primary flex-shrink">
              Quick log
            </Text>
            <Switch
              value={values.showInQuickLog}
              onValueChange={(val) =>
                setValues((prev) => ({ ...prev, showInQuickLog: val }))
              }
              accessibilityLabel="Quick log"
            />
          </View>

          <Button
            variant="primary"
            className="mt-4"
            disabled={isSaving || (!isSystem && values.name.trim() === '')}
            onPress={() =>
              onSave({
                name: values.name.trim(),
                defaultTime: values.defaultTime,
                isVisible: values.isVisible,
                showInQuickLog: values.showInQuickLog,
              })
            }
            accessibilityLabel={mode === 'add' ? 'Create meal type' : 'Save meal type'}
          >
            {isSaving ? 'Saving…' : mode === 'add' ? 'Add' : 'Save'}
          </Button>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

MealTypeFormSheet.displayName = 'MealTypeFormSheet';

export default MealTypeFormSheet;
