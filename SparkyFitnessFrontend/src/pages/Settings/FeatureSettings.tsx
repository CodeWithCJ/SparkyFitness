import type { ReactElement } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ToggleRight, type LucideIcon } from 'lucide-react';
import {
  FEATURE_GROUPS,
  FEATURE_KEYS,
  OPTIONAL_FEATURES,
  type ChoiceFeatureKey,
  type FeatureGroup,
  type FeatureKey,
} from '@workspace/shared';
import { AccordionContent, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useSetWebFeatureChoice } from '@/hooks/Settings/useFeatureChoices';
import {
  useCycleSwitch,
  useWebFeatures,
} from '@/hooks/Settings/useWebFeatures';
import {
  choiceFeatureLabel,
  cycleTabIcon,
  cycleTabLabel,
  webTabIcon,
} from '@/constants/webTabs';
import { CycleSetupPrompt } from './CycleSetupPrompt';

function FeatureIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}

function groupLabel(t: TFunction, group: FeatureGroup): string {
  switch (group) {
    case 'health':
      return t('settings.features.groups.health', 'Health');
    case 'nutrition':
      return t('settings.features.groups.nutrition', 'Nutrition');
    case 'training':
      return t('settings.features.groups.training', 'Training');
    case 'wellbeing':
      return t('settings.features.groups.wellbeing', 'Wellbeing');
  }
}

/**
 * Cycle tracking: one switch for the whole account, so it also shows or hides
 * cycle in the mobile app. Named like its tab, so discreet mode never says
 * Cycle here either.
 */
function CycleFeatureRow() {
  const { t } = useTranslation();
  const cycle = useCycleSwitch();
  const discreet = cycle.settings?.discreet_mode === true;

  // Until the settings are known, so is discreet mode: show nothing that
  // could name cycle.
  if (cycle.state === 'loading') {
    return (
      <div className="h-10 animate-pulse rounded-md bg-muted/40" aria-hidden />
    );
  }
  if (cycle.state === 'loadFailed') {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-destructive">
          {t('settings.features.loadError', 'Could not load this setting.')}
        </p>
        <Button variant="outline" size="sm" onClick={cycle.reload}>
          {t('common.retry', 'Retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="feature-cycle" className="flex items-center gap-2">
            <FeatureIcon icon={cycleTabIcon(cycle.settings)} />
            {cycleTabLabel(t, cycle.settings)}
          </Label>
          {!discreet && (
            <p className="text-sm text-muted-foreground">
              {t(
                'settings.features.cycle.description',
                'Track periods, fertility and pregnancy.'
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {t(
              'settings.features.cycle.scope',
              'One switch for the website and the mobile app.'
            )}
          </p>
        </div>
        <Switch
          id="feature-cycle"
          checked={cycle.on}
          disabled={cycle.state !== 'ready' || cycle.isPending}
          onCheckedChange={cycle.setOn}
        />
      </div>
      {cycle.needsSetup && <CycleSetupPrompt onOpen={cycle.openSetup} />}
    </div>
  );
}

/**
 * A feature with one choice per platform (`feature_choices`): this switch
 * changes the website only. It can be used once the choices have loaded;
 * until then it shows the default, so nothing looks off that is not.
 */
function ChoiceFeatureRow({
  feature,
  icon,
  label,
  description,
}: {
  feature: ChoiceFeatureKey;
  icon: LucideIcon;
  label: string;
  description: string;
}) {
  const { t } = useTranslation();
  const { isEnabled } = useWebFeatures();
  const choice = useSetWebFeatureChoice();
  const switchId = `feature-${feature}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor={switchId} className="flex items-center gap-2">
            <FeatureIcon icon={icon} />
            {label}
          </Label>
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="text-xs text-muted-foreground">
            {t(
              'settings.features.webOnly',
              'Only this website. The mobile app has its own switch.'
            )}
          </p>
        </div>
        <Switch
          id={switchId}
          checked={isEnabled(feature)}
          disabled={choice.state !== 'ready' || choice.isPending}
          onCheckedChange={(on) => choice.setFeatureOn(feature, on)}
        />
      </div>
      {choice.state === 'loadFailed' && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">
            {t('settings.features.loadError', 'Could not load this setting.')}
          </p>
          <Button variant="outline" size="sm" onClick={choice.reload}>
            {t('common.retry', 'Retry')}
          </Button>
        </div>
      )}
    </div>
  );
}

function LabResultsFeatureRow() {
  const { t } = useTranslation();
  return (
    <ChoiceFeatureRow
      feature="labResults"
      icon={webTabIcon('labs')}
      label={choiceFeatureLabel(t, 'labResults')}
      description={t(
        'settings.features.labResults.description',
        'Record blood tests and follow each marker over time.'
      )}
    />
  );
}

/** One row per feature. A new registry key needs its own row here. */
function FeatureRow({ feature }: { feature: FeatureKey }): ReactElement {
  switch (feature) {
    case 'cycle':
      return <CycleFeatureRow />;
    case 'labResults':
      return <LabResultsFeatureRow />;
  }
}

/**
 * Settings > Profile & Account > Features: turn whole features on or off on
 * this website, grouped as in the shared registry. Only the account owner can
 * change them; someone acting for them gets a note instead of the switches.
 */
export const FeatureSettings = () => {
  const { t } = useTranslation();
  const { isActingOnBehalf } = useActiveUser();

  return (
    <>
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.features.description',
          'Turn whole features on or off on this website'
        )}
      >
        <ToggleRight className="h-5 w-5" />
        {t('settings.features.title', 'Features')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        {isActingOnBehalf ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'settings.features.actingOnBehalf',
              'Only the account owner can turn features on or off.'
            )}
          </p>
        ) : (
          FEATURE_GROUPS.map((group) => {
            const keys = FEATURE_KEYS.filter(
              (key) => OPTIONAL_FEATURES[key].group === group
            );
            if (keys.length === 0) return null;
            return (
              <section key={group} className="space-y-3">
                <h3 className="text-sm font-semibold">
                  {groupLabel(t, group)}
                </h3>
                {keys.map((key) => (
                  <FeatureRow key={key} feature={key} />
                ))}
              </section>
            );
          })
        )}
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.features.footnote',
            'Turning a feature off only hides it: nothing is deleted, and syncs and imports keep running.'
          )}
        </p>
      </AccordionContent>
    </>
  );
};
