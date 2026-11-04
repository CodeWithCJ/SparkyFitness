import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import EnhancedFoodSearch from '@/components/FoodSearch/FoodSearch';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatTimeOfDayString } from '@/utils/timeFormatters';
import {
  buildTimelineGroups,
  hourSlotTime,
  type TimelineItem,
  type TimelineMealType,
} from '@/utils/diaryTimeline';
import type { Food, FoodEntry } from '@/types/food';
import type { FoodEntryMeal, Meal } from '@/types/meal';

interface DiaryTimelineProps {
  selectedDate: string;
  foodEntries: FoodEntry[];
  foodEntryMeals: FoodEntryMeal[];
  mealTypes: TimelineMealType[];
  /** `time` is the HH:MM slot the user added at, or null for "now". */
  onFoodSelect: (item: Food | Meal, time: string | null) => void;
  onEditEntry: (entry: FoodEntry | FoodEntryMeal) => void;
  onRemoveEntry: (
    itemId: string,
    itemType: 'foodEntry' | 'foodEntryMeal'
  ) => Promise<void>;
  getEntryNutrition: (entry: FoodEntry | FoodEntryMeal) => {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

const DiaryTimeline = ({
  selectedDate,
  foodEntries,
  foodEntryMeals,
  mealTypes,
  onFoodSelect,
  onEditEntry,
  onRemoveEntry,
  getEntryNutrition,
}: DiaryTimelineProps) => {
  const { t } = useTranslation();
  const { timeFormat, energyUnit, convertEnergy, getDateRelationToToday } =
    usePreferences();
  // undefined = search closed; null = add at "now"; HH:MM = add at that slot.
  const [addAt, setAddAt] = useState<string | null | undefined>(undefined);

  const groups = useMemo(
    () => buildTimelineGroups(foodEntries, foodEntryMeals, mealTypes),
    [foodEntries, foodEntryMeals, mealTypes]
  );

  const energyLabel =
    energyUnit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  const formatEnergy = (kcal: number) =>
    Math.round(convertEnergy(kcal, 'kcal', energyUnit));

  const dateRelation = getDateRelationToToday(selectedDate);

  const renderItem = (item: TimelineItem) => {
    const { entry, kind } = item;
    const nutrition = getEntryNutrition(entry);
    const name =
      kind === 'foodEntryMeal'
        ? (entry as FoodEntryMeal).name
        : (entry as FoodEntry).food_name;
    const serving = [entry.quantity, entry.unit]
      .filter((value) => value !== undefined && value !== null)
      .join(' ');
    const details = [
      item.time && !item.estimated
        ? formatTimeOfDayString(item.time, timeFormat)
        : null,
      item.mealTypeName,
      serving,
    ].filter(Boolean);

    return (
      <li key={`${kind}:${entry.id}`} className="group relative pl-6">
        <span
          aria-hidden
          className={
            item.estimated || !item.time
              ? 'absolute -left-[5px] top-3 h-2.5 w-2.5 rounded-full border-2 border-muted-foreground/50 bg-background'
              : 'absolute -left-[5px] top-3 h-2.5 w-2.5 rounded-full bg-primary'
          }
        />
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => onEditEntry(entry)}
          >
            <div className="truncate font-medium">{name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {details.join(' · ')}
            </div>
          </button>
          <div className="shrink-0 text-right">
            <div className="text-sm font-medium tabular-nums">
              {formatEnergy(nutrition.calories)} {energyLabel}
            </div>
            <div className="hidden text-xs text-muted-foreground tabular-nums sm:block">
              {t('diary.timeline.macros', 'P {{p}} · C {{c}} · F {{f}}', {
                p: Math.round(nutrition.protein),
                c: Math.round(nutrition.carbs),
                f: Math.round(nutrition.fat),
              })}
            </div>
          </div>
          <div className="flex shrink-0 items-center sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onEditEntry(entry)}
              title={t('common.edit', 'Edit')}
              aria-label={t('common.edit', 'Edit')}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onRemoveEntry(entry.id, kind)}
              title={t('common.delete', 'Delete')}
              aria-label={t('common.delete', 'Delete')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </li>
    );
  };

  const totalCalories = groups.reduce(
    (sum, group) =>
      sum +
      group.items.reduce(
        (groupSum, item) => groupSum + getEntryNutrition(item.entry).calories,
        0
      ),
    0
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-lg sm:text-xl dark:text-slate-300">
              {t('diary.timeline.title', 'Timeline')}
            </CardTitle>
            <span className="text-xs text-muted-foreground sm:text-sm">
              {formatEnergy(totalCalories)} {energyLabel}
            </span>
          </div>
          <Button size="sm" onClick={() => setAddAt(null)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('diary.timeline.addFood', 'Add food')}
          </Button>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t('foodDiary.noFoodsAddedYet', 'No foods added yet')}
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <section key={group.hour ?? 'untimed'} className="group/slot">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.hour === null
                        ? t('diary.timeline.noTime', 'No time')
                        : formatTimeOfDayString(
                            hourSlotTime(group.hour),
                            timeFormat
                          )}
                    </h3>
                    {group.hour !== null && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground sm:opacity-0 sm:transition-opacity sm:group-hover/slot:opacity-100 sm:focus-visible:opacity-100"
                        onClick={() => setAddAt(hourSlotTime(group.hour!))}
                        title={t(
                          'diary.timeline.addAt',
                          'Add food at {{time}}',
                          {
                            time: formatTimeOfDayString(
                              hourSlotTime(group.hour),
                              timeFormat
                            ),
                          }
                        )}
                        aria-label={t(
                          'diary.timeline.addAt',
                          'Add food at {{time}}',
                          {
                            time: formatTimeOfDayString(
                              hourSlotTime(group.hour),
                              timeFormat
                            ),
                          }
                        )}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <ul className="ml-1 space-y-0.5 border-l border-border">
                    {group.items.map(renderItem)}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addAt !== undefined}
        onOpenChange={(open) => !open && setAddAt(undefined)}
      >
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {addAt
                ? t('diary.timeline.addAt', 'Add food at {{time}}', {
                    time: formatTimeOfDayString(addAt, timeFormat),
                  })
                : t('diary.timeline.addFood', 'Add food')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'diary.timeline.addDescription',
                'Pick a food or meal. You can adjust the time and meal next.'
              )}
              {dateRelation !== 'today' && (
                <>
                  <br />
                  <span className="text-red-500">
                    {dateRelation === 'past'
                      ? t(
                          'foodDiary.pastDateWarning',
                          'Warning: You are adding food entries for a past date.'
                        )
                      : t(
                          'foodDiary.futureDateWarning',
                          'Warning: You are adding food entries for a future date.'
                        )}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <EnhancedFoodSearch
            onFoodSelect={(item) => {
              const time = addAt ?? null;
              setAddAt(undefined);
              onFoodSelect(item, time);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DiaryTimeline;
