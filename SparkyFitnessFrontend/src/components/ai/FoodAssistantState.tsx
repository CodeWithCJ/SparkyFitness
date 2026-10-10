import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFoodAssistantState } from '@/hooks/AI/useFoodAssistantState';
import { foodAssistantShoppingResultSchema } from '@workspace/shared';

export function FoodAssistantState({
  onResume,
}: {
  onResume: (taskId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [editing, setEditing] = useState<string>();
  const [value, setValue] = useState('');
  const { preferences, tasks, operations, mutation } = useFoodAssistantState(
    open,
    selectedId,
    onResume
  );
  const selected = tasks.data?.find((task) => task.id === selectedId);
  const shopping = foodAssistantShoppingResultSchema.safeParse(
    selected?.result
  );

  return (
    <div className="border-b px-3 py-2 text-sm">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t('foodAssistant.state', 'Food preferences and tasks')}
      </Button>
      {open && (
        <div className="max-h-72 overflow-auto space-y-3 py-2">
          {(preferences.isLoading || tasks.isLoading) && (
            <p>{t('common.loading', 'Loading...')}</p>
          )}
          {(preferences.error ||
            tasks.error ||
            operations.error ||
            mutation.error) && (
            <p role="alert">
              {t(
                'foodAssistant.error',
                'Could not update assistant state. Refresh to read the latest version.'
              )}
            </p>
          )}
          <p className="text-muted-foreground">
            {t(
              'foodAssistant.memoryHelp',
              'Lasting food preferences are saved separately from chat history. A request for today can override them without changing them.'
            )}
          </p>
          {preferences.data?.map((preference) => (
            <div key={preference.key} className="rounded border p-2 space-y-1">
              <strong>{preference.key.replaceAll('_', ' ')}</strong>
              {editing === preference.key ? (
                <>
                  <Input
                    aria-label={t('foodAssistant.preference', 'Preference')}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    maxLength={2000}
                  />
                  <Button
                    size="sm"
                    disabled={mutation.isPending || !value.trim()}
                    onClick={() =>
                      mutation.mutate(
                        { action: 'edit', preference, value },
                        { onSuccess: () => setEditing(undefined) }
                      )
                    }
                  >
                    {t('common.save', 'Save')}
                  </Button>
                </>
              ) : (
                <p>{preference.value}</p>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() => {
                  setEditing(preference.key);
                  setValue(preference.value);
                }}
              >
                {t('common.edit', 'Edit')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ action: 'forget', preference })
                }
              >
                {t('foodAssistant.forget', 'Forget')}
              </Button>
            </div>
          ))}
          {preferences.data?.length === 0 && (
            <p>
              {t('foodAssistant.noPreferences', 'No saved food preferences.')}
            </p>
          )}
          {tasks.data?.map((task) => (
            <div key={task.id} className="rounded border p-2 space-y-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedId(task.id)}
              >
                {task.title}
              </Button>
              <span>
                {t(
                  `foodAssistant.status.${task.status}`,
                  task.status.replaceAll('_', ' ')
                )}
              </span>
              {task.status !== 'cancelled' && task.status !== 'complete' && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ action: 'resume', task })}
                  >
                    {t('foodAssistant.resume', 'Resume in chat')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ action: 'cancel', task })}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </>
              )}
            </div>
          ))}
          {tasks.data?.length === 0 && (
            <p>{t('foodAssistant.noTasks', 'No saved food tasks.')}</p>
          )}
          {selected && (
            <div className="rounded border p-2 space-y-2">
              <p>{selected.checkpoint.summary}</p>
              <p>{selected.checkpoint.next_step}</p>
              {shopping.success && (
                <fieldset className="space-y-2">
                  <legend>
                    {t('foodAssistant.shoppingList', 'Shopping list')}
                  </legend>
                  {shopping.data.items.map((item) => (
                    <label key={item.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.purchased}
                        disabled={mutation.isPending}
                        onChange={(event) =>
                          mutation.mutate({
                            action: 'mark_shopping',
                            task: selected,
                            itemId: item.id,
                            purchased: event.target.checked,
                          })
                        }
                      />
                      <span>
                        {t('foodAssistant.shoppingItem', {
                          defaultValue: '{{quantity}} {{unit}} {{name}}',
                          quantity: item.quantity.toLocaleString(i18n.language),
                          unit: item.unit,
                          name: item.name,
                        })}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {selected.checkpoint.ingredients.map((ingredient) => (
                <p key={ingredient.id}>
                  {ingredient.quantity ?? '?'} {ingredient.unit ?? ''}{' '}
                  {ingredient.description} —{' '}
                  {t(
                    `foodAssistant.ingredient.${ingredient.status}`,
                    ingredient.status
                  )}
                  {ingredient.issue && `: ${ingredient.issue}`}
                </p>
              ))}
              {selected.checkpoint.evidence
                .filter((evidence) => evidence.url)
                .map((evidence, index) => (
                  <a
                    key={index}
                    className="block underline"
                    href={evidence.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {evidence.title}
                  </a>
                ))}
              {operations.data?.map((operation) => (
                <p key={operation.id} className="text-muted-foreground">
                  {operation.kind} ·{' '}
                  {operation.created_at.toLocaleString(i18n.language)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
