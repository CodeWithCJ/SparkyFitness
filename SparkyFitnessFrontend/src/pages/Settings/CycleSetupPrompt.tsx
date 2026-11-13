import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/**
 * Shown while cycle tracking is on but its setup was never finished (or was
 * reset): the tab opens the setup wizard until then. Never names cycle, so
 * discreet mode holds.
 */
export function CycleSetupPrompt({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {t(
          'settings.features.cycle.setupHint',
          'Answer a few questions to finish setting it up.'
        )}
      </p>
      <Button variant="outline" size="sm" onClick={onOpen}>
        {t('settings.features.cycle.setupAction', 'Set up')}
      </Button>
    </div>
  );
}
