import { useState } from 'react';
import {
  Pressable,
  Text,
  TextInput,
  ScrollView,
  View,
  Linking,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAui, useAuiState } from '@assistant-ui/react-native';
import { useFoodAssistantState } from '../../hooks/useFoodAssistantState';

export default function FoodAssistantStatePanel() {
  const { t, i18n } = useTranslation();
  const taskStatus = {
    draft: t('foodAssistant.status.draft', { defaultValue: 'Draft' }),
    running: t('foodAssistant.status.running', { defaultValue: 'In progress' }),
    awaiting_input: t('foodAssistant.status.awaiting_input', {
      defaultValue: 'Needs input',
    }),
    complete: t('foodAssistant.status.complete', { defaultValue: 'Complete' }),
    cancelled: t('foodAssistant.status.cancelled', {
      defaultValue: 'Cancelled',
    }),
    failed: t('foodAssistant.status.failed', {
      defaultValue: 'Failed',
    }),
  };
  const ingredientStatus = {
    unresolved: t('foodAssistant.ingredient.unresolved', {
      defaultValue: 'Needs matching',
    }),
    selected: t('foodAssistant.ingredient.selected', {
      defaultValue: 'Selected',
    }),
    verified: t('foodAssistant.ingredient.verified', {
      defaultValue: 'Verified',
    }),
  };
  const aui = useAui();
  const running = useAuiState((state) => state.thread.isRunning);
  const [open, setOpen] = useState(false),
    [selectedId, setSelectedId] = useState<string>(),
    [editing, setEditing] = useState<string>(),
    [value, setValue] = useState('');
  const { preferences, tasks, operations, mutation } = useFoodAssistantState(
    open,
    selectedId,
    (id) => {
      aui.thread().append({
        role: 'user',
        content: [
          {
            type: 'text',
            text: t('foodAssistant.resumePrompt', {
              defaultValue:
                'Resume food task {{id}}. Read its current checkpoint and continue the remaining work.',
              id,
            }),
          },
        ],
      });
      setOpen(false);
    }
  );
  const selected = tasks.data?.find((task) => task.id === selectedId);
  const disabled = running || mutation.isPending;
  return (
    <View className="border-b border-border-subtle px-4 py-2">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
      >
        <Text className="text-text-primary font-medium">
          {t('foodAssistant.state', {
            defaultValue: 'Food preferences and tasks',
          })}
        </Text>
      </Pressable>
      {open && (
        <ScrollView
          style={{ maxHeight: 280 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-text-muted py-2">
            {t('foodAssistant.memoryHelp', {
              defaultValue:
                'Lasting food preferences are saved separately from chat history. A request for today can override them without changing them.',
            })}
          </Text>
          {(preferences.isLoading || tasks.isLoading) && (
            <Text className="text-text-muted">
              {t('common.loading', { defaultValue: 'Loading...' })}
            </Text>
          )}
          {(preferences.error ||
            tasks.error ||
            operations.error ||
            mutation.error) && (
            <Text accessibilityRole="alert" className="text-text-primary">
              {t('foodAssistant.error', {
                defaultValue:
                  'Could not update assistant state. Refresh to read the latest version.',
              })}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => {
              void preferences.refetch();
              void tasks.refetch();
              if (selectedId) void operations.refetch();
            }}
          >
            <Text className="text-text-primary py-2">
              {t('common.refresh', { defaultValue: 'Refresh' })}
            </Text>
          </Pressable>
          {preferences.data?.map((preference) => (
            <View
              key={preference.key}
              className="border border-border-subtle rounded-lg p-2 mb-2 gap-1"
            >
              <Text className="text-text-primary font-medium">
                {preference.key.replaceAll('_', ' ')}
              </Text>
              {editing === preference.key ? (
                <>
                  <TextInput
                    accessibilityLabel={t('foodAssistant.preference', {
                      defaultValue: 'Preference',
                    })}
                    className="text-text-primary border border-border-subtle rounded px-2 py-1"
                    value={value}
                    onChangeText={setValue}
                    maxLength={2000}
                    multiline
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={disabled || !value.trim()}
                    onPress={() =>
                      mutation.mutate(
                        { action: 'edit', preference, value },
                        { onSuccess: () => setEditing(undefined) }
                      )
                    }
                  >
                    <Text className="text-text-primary py-1">
                      {t('common.save', { defaultValue: 'Save' })}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Text className="text-text-secondary">{preference.value}</Text>
              )}
              <View className="flex-row gap-4">
                <Pressable
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => {
                    setEditing(preference.key);
                    setValue(preference.value);
                  }}
                >
                  <Text className="text-text-primary py-1">
                    {t('common.edit', { defaultValue: 'Edit' })}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() =>
                    mutation.mutate({ action: 'forget', preference })
                  }
                >
                  <Text className="text-text-primary py-1">
                    {t('foodAssistant.forget', { defaultValue: 'Forget' })}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
          {preferences.data?.length === 0 && (
            <Text className="text-text-muted">
              {t('foodAssistant.noPreferences', {
                defaultValue: 'No saved food preferences.',
              })}
            </Text>
          )}
          {tasks.data?.map((task) => (
            <View
              key={task.id}
              className="border border-border-subtle rounded-lg p-2 my-1 gap-1"
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => setSelectedId(task.id)}
              >
                <Text className="text-text-primary font-medium">
                  {task.title}
                </Text>
              </Pressable>
              <Text className="text-text-muted">{taskStatus[task.status]}</Text>
              {!['complete', 'cancelled'].includes(task.status) && (
                <View className="flex-row gap-4">
                  <Pressable
                    accessibilityRole="button"
                    disabled={disabled}
                    onPress={() => mutation.mutate({ action: 'resume', task })}
                  >
                    <Text className="text-text-primary py-1">
                      {t('foodAssistant.resume', {
                        defaultValue: 'Resume in chat',
                      })}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={disabled}
                    onPress={() => mutation.mutate({ action: 'cancel', task })}
                  >
                    <Text className="text-text-primary py-1">
                      {t('common.cancel', { defaultValue: 'Cancel' })}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
          {tasks.data?.length === 0 && (
            <Text className="text-text-muted">
              {t('foodAssistant.noTasks', {
                defaultValue: 'No saved food tasks.',
              })}
            </Text>
          )}
          {selected && (
            <View className="border border-border-subtle rounded-lg p-2 my-2 gap-2">
              <Text className="text-text-primary">
                {selected.checkpoint.summary}
              </Text>
              {selected.checkpoint.next_step && (
                <Text className="text-text-secondary">
                  {selected.checkpoint.next_step}
                </Text>
              )}
              {selected.checkpoint.ingredients.map((ingredient) => (
                <Text key={ingredient.id} className="text-text-secondary">
                  {ingredient.quantity ?? '?'} {ingredient.unit ?? ''}{' '}
                  {ingredient.description} —{' '}
                  {ingredientStatus[ingredient.status]}
                  {ingredient.issue ? `: ${ingredient.issue}` : ''}
                </Text>
              ))}
              {selected.checkpoint.evidence
                .filter((evidence) => evidence.url)
                .map((evidence, index) => (
                  <Pressable
                    key={index}
                    accessibilityRole="link"
                    onPress={() => {
                      if (evidence.url) void Linking.openURL(evidence.url);
                    }}
                  >
                    <Text className="text-text-primary underline">
                      {evidence.title}
                    </Text>
                  </Pressable>
                ))}
              {operations.data?.map((operation) => (
                <Text key={operation.id} className="text-text-muted">
                  {operation.kind} ·{' '}
                  {operation.created_at.toLocaleString(i18n.language)}
                </Text>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
