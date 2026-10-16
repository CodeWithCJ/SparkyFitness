import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  foodAssistantDiaryConfirmationSchema,
  foodAssistantTaskSchema,
} from '@workspace/shared';
import { apiCall } from '@/api/api';

const entriesSchema = z.object({
  entries: z.array(
    z.object({
      id: z.string(),
      food_name: z.string().nullable(),
      quantity: z.coerce.number(),
      unit: z.string(),
      entry_date: z.string(),
    })
  ),
});
const inspectionSchema = entriesSchema.extend({ fingerprint: z.string() });
const resultSchema = z.object({
  kind: z.literal('diary'),
  diary_operation_id: z.string(),
  before: entriesSchema,
  after: entriesSchema,
});

function parseRequest(hash: string) {
  try {
    return foodAssistantDiaryConfirmationSchema.safeParse(
      JSON.parse(decodeURIComponent(hash.slice(1)))
    );
  } catch {
    return foodAssistantDiaryConfirmationSchema.safeParse(null);
  }
}

export function useDiaryConfirmation() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const parsed = parseRequest(hash);
  const request = parsed.success ? parsed.data : undefined;
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ['foodAssistant', 'diaryConfirmation', hash],
    enabled: Boolean(request),
    retry: false,
    queryFn: async () => {
      if (!request) throw new Error(t('foodAssistant.confirmationInvalid'));
      const task = foodAssistantTaskSchema.parse(
        await apiCall(`/v2/food-assistant/tasks/${request.task_id}`)
      );
      const command =
        request.action === 'undo' ? request.undo : request.command;
      if (task.kind !== 'diary' || task.version !== command.expected_version)
        throw new Error(t('foodAssistant.confirmationChanged'));
      if (request.action === 'undo') {
        const result = resultSchema.parse(task.result);
        if (result.diary_operation_id !== request.undo.diary_operation_id)
          throw new Error(t('foodAssistant.confirmationChanged'));
        return {
          current: result.after.entries,
          restored: result.before.entries,
        };
      }
      if (request.command.action.type !== 'delete')
        throw new Error(t('foodAssistant.confirmationInvalid'));
      const inspection = inspectionSchema.parse(
        await apiCall('/v2/food-assistant/diary/inspect', {
          method: 'POST',
          body: request.command.action.scope,
        })
      );
      if (
        inspection.fingerprint !== request.command.action.expected_fingerprint
      )
        throw new Error(t('foodAssistant.confirmationChanged'));
      return { current: inspection.entries, restored: [] };
    },
  });
  const confirm = useMutation({
    mutationFn: async () => {
      if (!request || !preview.data)
        throw new Error(t('foodAssistant.confirmationInvalid'));
      const action = request.action === 'undo' ? 'undo' : 'apply';
      const body = request.action === 'undo' ? request.undo : request.command;
      await apiCall(`/v2/food-assistant/diary/${action}/${request.task_id}`, {
        method: 'POST',
        body,
      });
    },
    onSuccess: async () => {
      // This preview intentionally describes the version just committed. Keep
      // it stable while refreshing the diary, tasks and other affected views.
      await queryClient.invalidateQueries({
        predicate: ({ queryKey }) =>
          !(
            queryKey[0] === 'foodAssistant' &&
            queryKey[1] === 'diaryConfirmation' &&
            queryKey[2] === hash
          ),
      });
    },
  });
  return { request, preview, confirm };
}
export type DiaryConfirmationEntry = z.infer<
  typeof entriesSchema
>['entries'][number];
