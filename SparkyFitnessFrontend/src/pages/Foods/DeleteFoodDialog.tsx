import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { Food, FoodDeletionImpact } from '@/types/food';
import { usePreferences } from '@/contexts/PreferencesContext';

export interface PendingDeletion {
  food: Food;
  impact: FoodDeletionImpact;
}

interface DeleteFoodDialogProps {
  pendingDeletion: PendingDeletion | null;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
  mealTypes?: { id: string; name: string }[];
}

const toISODate = (date: string) => date.split('T')[0];

const DeleteFoodDialog: React.FC<DeleteFoodDialogProps> = ({
  pendingDeletion,
  onConfirm,
  onCancel,
  mealTypes,
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();

  if (!pendingDeletion) return null;

  const { food, impact } = pendingDeletion;

  const summaryCounts = [
    { key: 'mealComponents', count: impact.mealFoodsCount },
    { key: 'mealPlanEntries', count: impact.mealPlansCount },
    {
      key: 'mealPlanTemplateEntries',
      count: impact.mealPlanTemplateAssignmentsCount,
    },
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('foodDatabaseManager.deleteFoodConfirmTitle', {
              foodName: food.name,
              defaultValue: `Delete ${food.name}?`,
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('foodDatabaseManager.foodUsedIn', 'This food is used in:')}
          </p>

          <div className="space-y-1.5">
            {impact.foodEntries.length > 0 ? (
              <Collapsible
                defaultOpen
                className="overflow-hidden rounded-lg border border-border"
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between bg-muted/40 px-3 py-2.5 text-start text-sm font-medium transition-colors hover:bg-muted/70">
                  <span>
                    {t('foodDatabaseManager.diaryEntries', {
                      count: impact.foodEntriesCount,
                      defaultValue: `${impact.foodEntriesCount} diary entries`,
                    })}
                  </span>
                  <span className="text-xs text-muted-foreground" aria-hidden>
                    ▼
                  </span>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="max-h-56 divide-y divide-border overflow-y-auto">
                    {impact.foodEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center gap-4 px-3 py-2 text-sm transition-colors hover:bg-muted/30"
                      >
                        <span className="w-28 shrink-0 font-medium tabular-nums">
                          {formatDateInUserTimezone(
                            entry.entry_date,
                            'd MMMM yyyy'
                          )}
                        </span>
                        <span className="flex-1 text-muted-foreground capitalize">
                          {mealTypes?.find((mt) => mt.id === entry.meal_type_id)
                            ?.name ?? '—'}
                        </span>
                        {entry.isCurrentUser ? (
                          <Link
                            to={
                              '/?date=' +
                              toISODate(entry.entry_date) +
                              '&highlight=' +
                              food.id
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 cursor-pointer text-xs text-primary underline underline-offset-2 transition-colors hover:text-primary/70"
                          >
                            {t(
                              'foodDatabaseManager.viewDiaryEntry',
                              'View entry'
                            )}
                          </Link>
                        ) : (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {t('foodDatabaseManager.otherUser', 'Other user')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                {t('foodDatabaseManager.diaryEntries', {
                  count: 0,
                  defaultValue: '0 diary entries',
                })}
              </div>
            )}

            {summaryCounts
              .filter(({ count }) => count > 0)
              .map(({ key, count }) => (
                <div
                  key={key}
                  className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm"
                >
                  <span>{t('foodDatabaseManager.' + key, { count })}</span>
                </div>
              ))}
          </div>

          {impact.otherUserReferences > 0 && (
            <div className="space-y-1 rounded-lg border border-yellow-200 bg-yellow-50 p-3.5 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300">
              <p className="font-semibold">
                {t('foodDatabaseManager.warning', 'Warning!')}
              </p>
              <p className="text-yellow-700 dark:text-yellow-400">
                {t(
                  'foodDatabaseManager.foodUsedByOtherUsersWarning',
                  'This food is used by other users. You can only hide it. Hiding will prevent other users from adding this food in the future, but it will not affect their existing history, meals, or meal plans.'
                )}
              </p>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel}>
            {t('foodDatabaseManager.cancel', 'Cancel')}
          </Button>
          {impact.totalReferences === 0 ? (
            <Button variant="destructive" onClick={() => onConfirm(true)}>
              {t('foodDatabaseManager.delete', 'Delete')}
            </Button>
          ) : impact.otherUserReferences > 0 ? (
            <Button onClick={() => onConfirm(false)}>
              {t('foodDatabaseManager.hide', 'Hide')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onConfirm(false)}>
                {t('foodDatabaseManager.hide', 'Hide')}
              </Button>
              <Button variant="destructive" onClick={() => onConfirm(true)}>
                {t('foodDatabaseManager.forceDelete', 'Force Delete')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteFoodDialog;
