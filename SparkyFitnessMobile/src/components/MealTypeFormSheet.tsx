import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import { toHourMinute } from '@workspace/shared';
import MealTypeTimeWheel from './MealTypeTimeWheel';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import Switch from './ui/Switch';
import Button from './ui/Button';
import Icon from './Icon';
import type { MealType } from '../types/mealTypes';
import type { MealTypeTimePickerSheetRef } from './MealTypeTimePickerSheet';

export interface MealTypeFormSheetRef {
  presentCreate: () => void;
  presentEdit: (mealType: MealType) => void;
  dismiss: () => void;
}

export interface MealTypeFormValues {
  name: string;
  defaultTime: string;
  showInQuickLog: boolean;
}

interface MealTypeFormSheetProps {
  /** True when the sheet is used for a system type (name display-only, no delete). */
  isSystem?: boolean;
  isSaving?: boolean;
  onCreate: (values: MealTypeFormValues) => void;
  onEditSave: (values: MealTypeFormValues) => void;
  /** Custom types only; absent for system rows. */
  onDelete?: () => void;
  /** Reference to the dedicated LARGE time picker (edit mode uses a row + sheet). */
  timePickerRef?: React.RefObject<MealTypeTimePickerSheetRef | null>;
}

/**
 * Shared Add / Edit sheet for meal types.
 *
 * CREATE: name + Quick log + the actual large time wheel inline (one creation
 * experience; no Delete — it is an unsaved record).
 *
 * EDIT: name (custom editable / system display-only), Quick log, a Default
 * time ROW that opens the dedicated large time-picker sheet, and a destructive
 * Delete action for custom types only.
 *
 * Visibility is owned by the row-level Switch on the main settings list, so it
 * is intentionally absent here (mockup placement).
 *
 * Raw sort_order is never exposed; custom ordering happens on the settings
 * screen via drag-and-drop between the fixed system anchors.
 */
const MealTypeFormSheet = forwardRef<MealTypeFormSheetRef, MealTypeFormSheetProps>(
  ({ isSystem = false, isSaving = false, onCreate, onEditSave, onDelete, timePickerRef }, ref) => {
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const [surfaceBg, textMuted, textSecondary, iconDanger] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-text-secondary',
      '--color-icon-danger',
    ]) as [string, string, string, string];

    const [values, setValues] = useState<MealTypeFormValues>({
      name: '',
      defaultTime: '',
      showInQuickLog: false,
    });
    const [mode, setMode] = useState<'create' | 'edit'>('create');

    useImperativeHandle(ref, () => ({
      presentCreate: () => {
        setMode('create');
        // The inline wheel always shows a concrete time (current time when no
        // default is set); initialize the form to EXACTLY what the wheel
        // displays so untouched Create saves the visible time — visual state
        // and payload state never disagree.
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        setValues({
          name: '',
          defaultTime: `${hh}:${mm}`,
          showInQuickLog: false,
        });
        bottomSheetRef.current?.present();
      },
      presentEdit: (mealType) => {
        setMode('edit');
        setValues({
          name: mealType.name,
          defaultTime: toHourMinute(mealType.default_time) || '',
          showInQuickLog: mealType.show_in_quick_log,
        });
        bottomSheetRef.current?.present();
      },
      dismiss: () => bottomSheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useSheetBackdrop();

    const isEditingSystem = mode === 'edit' && isSystem;
    const hasDefaultTime = values.defaultTime !== '';
    const canSave = !isSaving && (isEditingSystem || values.name.trim() !== '');

    const handleSave = () => {
      if (!canSave) return;
      const payload: MealTypeFormValues = {
        name: values.name.trim(),
        defaultTime: values.defaultTime,
        showInQuickLog: values.showInQuickLog,
      };
      if (mode === 'create') onCreate(payload);
      else onEditSave(payload);
    };

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        enableContentPanningGesture={Platform.OS !== 'android'}
        backdropComponent={renderBackdrop}
        containerComponent={sheetContainer}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
        onDismiss={() => {
          setValues({ name: '', defaultTime: '', showInQuickLog: false });
        }}
      >
        <BottomSheetScrollView contentContainerClassName="px-5 pb-safe-or-8">
          <Text className="text-text-primary text-lg font-semibold text-center mb-4">
            {mode === 'create' ? 'Add Meal Type' : 'Edit Meal Type'}
          </Text>

          {/* Name — editable for custom, display-only for system */}
          <Text className="text-xs font-semibold uppercase text-text-muted mb-1">Name</Text>
          {isEditingSystem ? (
            <View className="bg-background border border-border rounded-lg px-3 py-2.5 mb-4">
              <Text className="text-base text-text-primary">{values.name}</Text>
            </View>
          ) : (
            <TextInput
              value={values.name}
              onChangeText={(name) => setValues((prev) => ({ ...prev, name }))}
              placeholder="e.g. Lunch 2.0"
              placeholderTextColor={textMuted}
              className="bg-background border border-border text-text-primary rounded-lg px-3 py-2.5 text-base mb-4"
              autoFocus={mode === 'create'}
              returnKeyType="done"
              accessibilityLabel="Meal type name"
            />
          )}

          {/* Quick log */}
          <View className="flex-row justify-between items-center py-3 border-t border-border-subtle">
            <Text className="text-base font-medium text-text-primary flex-shrink">
              Quick log
            </Text>
            <Switch
              value={values.showInQuickLog}
              onValueChange={(val) =>
                setValues((prev) => ({ ...prev, showInQuickLog: val }))
              }
              accessibilityLabel={`Quick log ${values.name || 'meal type'}`}
            />
          </View>

          {/* Default time: create = inline wheel; edit = row opening the picker sheet */}
          <Text className="text-xs font-semibold uppercase text-text-muted mt-2 mb-1">
            Default time
          </Text>
          {mode === 'create' ? (
            <>
              {/* Shared large inline wheel — the SAME component and sizing as
                  the dedicated time sheet (apedley: stack the two components).
                  The dominant element of the create flow. */}
              <MealTypeTimeWheel
                value={values.defaultTime}
                onChange={(hhmm) => setValues((prev) => ({ ...prev, defaultTime: hhmm }))}
                testID="create-time-wheel"
              />
            </>
          ) : (
            <TouchableOpacity
              onPress={() => {
                if (timePickerRef?.current) {
                  // Seed from the CURRENT form value so an unsaved selection
                  // survives reopen.
                  timePickerRef.current.present(
                    values.defaultTime || null,
                    (time) => setValues((prev) => ({ ...prev, defaultTime: time ?? '' })),
                  );
                }
              }}
              className="flex-row items-center justify-between rounded-lg border border-border-subtle bg-background px-3 py-3 mb-4"
              accessibilityRole="button"
              accessibilityLabel={`Default time for ${values.name}${
                hasDefaultTime ? `, ${values.defaultTime}` : ', not set'
              }`}
              testID="edit-default-time-row"
            >
              <Text className="text-base text-text-primary">
                {hasDefaultTime ? values.defaultTime : 'Not set'}
              </Text>
              <Icon name="chevron-forward" size={18} color={textSecondary} />
            </TouchableOpacity>
          )}

          {mode === 'create' ? (
            <View className="flex-row gap-3 mt-2">
              <Button
                variant="secondary"
                className="flex-1"
                onPress={() => bottomSheetRef.current?.dismiss()}
                accessibilityLabel="Cancel create meal type"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={!canSave}
                onPress={handleSave}
                accessibilityLabel="Create meal type"
              >
                {isSaving ? 'Saving…' : 'Create'}
              </Button>
            </View>
          ) : (
            <Button
              variant="primary"
              className="mt-2"
              disabled={!canSave}
              onPress={handleSave}
              accessibilityLabel="Save meal type"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          )}

          {mode === 'edit' && !isEditingSystem && onDelete && (
            <TouchableOpacity
              onPress={() => {
                bottomSheetRef.current?.dismiss();
                onDelete();
              }}
              className="mt-6 py-3 border-t border-border-subtle items-center"
              accessibilityRole="button"
              accessibilityLabel="Delete Meal Type"
              testID="delete-meal-type-sheet"
            >
              <Text className="text-base font-medium" style={{ color: iconDanger }}>
                Delete Meal Type
              </Text>
            </TouchableOpacity>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

MealTypeFormSheet.displayName = 'MealTypeFormSheet';

export default MealTypeFormSheet;
