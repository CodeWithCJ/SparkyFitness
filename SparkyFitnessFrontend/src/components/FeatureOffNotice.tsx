import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * The page of a feature turned off in Settings > Features (#3487). Turning it
 * back on brings everything back as it was; nothing was deleted. `name` is the
 * feature's tab name (for cycle, the discreet one when discreet mode is on).
 */
export function FeatureOffNotice({
  name,
  onTurnOn,
  turningOn,
}: {
  name: string;
  onTurnOn: () => void;
  turningOn: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border p-6 text-center">
      <h1 className="text-xl font-semibold">
        {t('settings.features.off.title', '{{name}} is turned off', { name })}
      </h1>
      <p className="text-sm text-muted-foreground">
        {t(
          'settings.features.off.description',
          'Your history is kept. Turn it back on to see it here again.'
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onTurnOn} disabled={turningOn}>
          {t('settings.features.off.turnOn', 'Turn on')}
        </Button>
        <Button variant="outline" asChild>
          <Link to="/settings?section=features">
            {t('settings.features.open', 'Open Features')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
