import type { SharedCycleSettings } from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cycleTabLabel } from '@/constants/webTabs';

/**
 * /cycle while cycle is turned off after it was set up. Turning it back on
 * brings everything back as it was, without the setup wizard, which would ask
 * again and overwrite the settings. Named like the tab, so discreet mode holds.
 */
export function CycleOffNotice({
  settings,
  onTurnOn,
  turningOn,
}: {
  settings: Pick<SharedCycleSettings, 'mode' | 'discreet_mode'>;
  onTurnOn: () => void;
  turningOn: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border p-6 text-center">
      <h1 className="text-xl font-semibold">
        {t('cycle.off.title', '{{name}} is turned off', {
          name: cycleTabLabel(t, settings),
        })}
      </h1>
      <p className="text-sm text-muted-foreground">
        {t(
          'cycle.off.description',
          'Your history is kept. Turn it back on to see it here again.'
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onTurnOn} disabled={turningOn}>
          {t('cycle.off.turnOn', 'Turn on')}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/settings?section=features">
            {t('settings.cycle.openFeatures', 'Open Features')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
