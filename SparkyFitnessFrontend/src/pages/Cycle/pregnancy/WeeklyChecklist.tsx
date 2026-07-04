import { useTranslation } from 'react-i18next';
import { useChecklistMutation } from '@/hooks/usePregnancy';
import type { ChecklistItem } from './pregnancyTypes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Check, Circle } from 'lucide-react';

interface WeeklyChecklistProps {
  pregnancyId: string;
  week: number;
  items: ChecklistItem[];
  progress: { done: number; total: number };
}

export default function WeeklyChecklist({
  pregnancyId,
  week,
  items,
  progress,
}: WeeklyChecklistProps) {
  const { t } = useTranslation();
  const mutation = useChecklistMutation();

  const toggle = (item: ChecklistItem) => {
    mutation.mutate({
      id: item.id ?? undefined,
      pregnancy_id: pregnancyId,
      template_key: item.template_key,
      week: item.week,
      completed: !item.completed,
    });
  };

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">
          {t('pregnancy.checklist.title', "This week's checklist")}
        </CardTitle>
        <span className="text-sm text-muted-foreground">
          {progress.done} / {progress.total}
        </span>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <p className="mb-1 text-xs text-muted-foreground">
          {t('pregnancy.checklist.week', 'Week {{n}}', { n: week })}
        </p>
        {items.map((item) => (
          <button
            key={item.template_key ?? item.id ?? item.title}
            type="button"
            onClick={() => toggle(item)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-muted/40"
          >
            {item.completed ? (
              <Check className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                item.completed && 'text-muted-foreground line-through'
              )}
            >
              {item.title}
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
