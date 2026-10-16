import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  useDiaryConfirmation,
  type DiaryConfirmationEntry,
} from '@/hooks/Chatbot/useDiaryConfirmation';

export default function DiaryConfirmation() {
  const { t } = useTranslation();
  const { request, preview, confirm } = useDiaryConfirmation();
  const rows = (entries: DiaryConfirmationEntry[]) => (
    <ul className="list-disc pl-5">
      {entries.map((entry) => (
        <li key={entry.id}>
          {entry.food_name} · {entry.quantity} {entry.unit} · {entry.entry_date}
        </li>
      ))}
    </ul>
  );
  return (
    <section className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">
        {t('foodAssistant.confirmationTitle')}
      </h1>
      <p>{t('foodAssistant.confirmationDescription')}</p>
      {(!request || preview.error) && (
        <p role="alert">
          {preview.error?.message ?? t('foodAssistant.confirmationInvalid')}
        </p>
      )}
      {preview.isLoading && <p>{t('common.loading', 'Loading...')}</p>}
      {confirm.isSuccess ? (
        <p role="status">{t('foodAssistant.confirmationDone')}</p>
      ) : (
        preview.data && (
          <>
            <h2 className="font-medium">
              {t('foodAssistant.confirmationCurrent')}
            </h2>
            {rows(preview.data.current)}
            {request?.action === 'undo' && (
              <>
                <h2 className="font-medium">
                  {t('foodAssistant.confirmationRestore')}
                </h2>
                {rows(preview.data.restored)}
              </>
            )}
            <Button
              variant="destructive"
              disabled={confirm.isPending}
              onClick={() => confirm.mutate()}
            >
              {t(
                request?.action === 'undo'
                  ? 'foodAssistant.confirmUndo'
                  : 'foodAssistant.confirmDelete'
              )}
            </Button>
          </>
        )
      )}
      {confirm.error && <p role="alert">{confirm.error.message}</p>}
    </section>
  );
}
