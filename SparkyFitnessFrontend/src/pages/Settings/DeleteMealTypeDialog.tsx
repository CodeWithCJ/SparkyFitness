import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  DeleteMealTypeOptions,
  MealTypeDeletionImpact,
} from '@/hooks/Diary/useMealTypes';
import { MealTypeDefinition } from '@/types/diary';

export interface PendingMealTypeDeletion {
  mealType: MealTypeDefinition;
  impact: MealTypeDeletionImpact;
}

interface DeleteMealTypeDialogProps {
  pendingDeletion: PendingMealTypeDeletion | null;
  mealTypes: MealTypeDefinition[];
  onConfirm: (options: DeleteMealTypeOptions) => void;
  onCancel: () => void;
}

const DeleteMealTypeDialog = ({
  pendingDeletion,
  mealTypes,
  onConfirm,
  onCancel,
}: DeleteMealTypeDialogProps) => {
  const { t } = useTranslation();

  // Everything the user can move items into: their own types plus system
  // defaults, minus the one being deleted.
  const targets = useMemo(
    () => mealTypes.filter((mt) => mt.id !== pendingDeletion?.mealType.id),
    [mealTypes, pendingDeletion]
  );

  const [selected, setSelected] = useState<string | null>(null);

  // Deliberately no default target. Falling back to the first meal type made
  // the dialog look pre-filled and silently moved entries somewhere the user
  // never chose, so the move stays disabled until a target is picked.
  const reassignTo =
    selected && targets.some((mt) => mt.id === selected) ? selected : '';

  if (!pendingDeletion) return null;

  const { mealType, impact } = pendingDeletion;

  const counts = [
    {
      key: 'foodEntries',
      count: impact.foodEntries,
      label: t('mealTypeManager.impactFoodEntries', {
        count: impact.foodEntries,
        defaultValue: `${impact.foodEntries} diary entries`,
      }),
    },
    {
      key: 'foodEntryMeals',
      count: impact.foodEntryMeals,
      label: t('mealTypeManager.impactLoggedMeals', {
        count: impact.foodEntryMeals,
        defaultValue: `${impact.foodEntryMeals} logged meals`,
      }),
    },
    {
      key: 'mealPlans',
      count: impact.mealPlans,
      label: t('mealTypeManager.impactMealPlans', {
        count: impact.mealPlans,
        defaultValue: `${impact.mealPlans} planned items`,
      }),
    },
    {
      key: 'templateAssignments',
      count: impact.templateAssignments,
      label: t('mealTypeManager.impactTemplateAssignments', {
        count: impact.templateAssignments,
        defaultValue: `${impact.templateAssignments} meal plan template items`,
      }),
    },
  ].filter(({ count }) => count > 0);

  const isInUse = impact.totalReferences > 0;

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('mealTypeManager.deleteConfirmTitle', {
              name: mealType.name,
              defaultValue: `Delete "${mealType.name}"?`,
            })}
          </DialogTitle>
          <DialogDescription>
            {isInUse
              ? t(
                  'mealTypeManager.deleteInUseDescription',
                  'This meal category is still in use. Choose what should happen to the records below.'
                )
              : t(
                  'mealTypeManager.deleteEmptyDescription',
                  'Nothing references this meal category, so it can be removed safely.'
                )}
          </DialogDescription>
        </DialogHeader>

        {isInUse && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              {counts.map(({ key, label }) => (
                <div
                  key={key}
                  className="rounded-lg border border-border px-3 py-2.5 text-sm bg-muted/20"
                >
                  {label}
                </div>
              ))}
            </div>

            {targets.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="reassign-target">
                  {t('mealTypeManager.moveItemsTo', 'Move these items to')}
                </Label>
                <Select
                  value={reassignTo || undefined}
                  onValueChange={setSelected}
                >
                  <SelectTrigger id="reassign-target">
                    <SelectValue
                      placeholder={t(
                        'mealTypeManager.chooseTarget',
                        'Choose a meal category…'
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((mt) => (
                      <SelectItem key={mt.id} value={mt.id}>
                        {mt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t(
                    'mealTypeManager.moveItemsHint',
                    'Nutrition, dates and times are preserved. Only the meal category changes.'
                  )}
                </p>
              </div>
            )}

            <div className="p-3.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300 rounded-lg text-sm space-y-1">
              <p className="font-semibold">
                {t('mealTypeManager.warning', 'Warning!')}
              </p>
              <p className="text-yellow-700 dark:text-yellow-400">
                {t(
                  'mealTypeManager.forceDeleteWarning',
                  'Deleting everything permanently removes these records, including their logged nutrition. This cannot be undone.'
                )}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-2">
          {isInUse && (
            // Held apart from the confirm button on the right: this one
            // permanently destroys logged nutrition.
            <Button
              variant="destructive"
              className="mr-auto"
              onClick={() => onConfirm({ mode: 'force' })}
            >
              {t('mealTypeManager.deleteEverything', 'Delete everything')}
            </Button>
          )}
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
          {!isInUse ? (
            <Button
              variant="destructive"
              onClick={() => onConfirm({ mode: 'strict' })}
            >
              {t('common.delete', 'Delete')}
            </Button>
          ) : (
            <Button
              disabled={!reassignTo}
              onClick={() => onConfirm({ mode: 'reassign', reassignTo })}
            >
              {t('mealTypeManager.moveAndDelete', 'Move items and delete')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteMealTypeDialog;
