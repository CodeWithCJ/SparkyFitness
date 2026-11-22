import { useTranslation } from 'react-i18next';
import { PanelsTopLeft, type LucideIcon } from 'lucide-react';
import { isShownByFeature, WEB_HIDEABLE_TAB_IDS } from '@workspace/shared';
import { AccordionContent, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCycleSettings } from '@/hooks/useCycle';
import { useWebFeatures } from '@/hooks/Settings/useWebFeatures';
import { useChallengesAvailable } from '@/hooks/Challenges/useChallenges';
import {
  useHiddenWebTabs,
  useSetWebTabHidden,
} from '@/hooks/Settings/useHiddenWebTabs';
import {
  cycleTabIcon,
  cycleTabLabel,
  webTabFeature,
  webTabIcon,
  webTabLabel,
} from '@/constants/webTabs';

function TabIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}

interface WebTabsSettingsProps {
  /** Opens Settings > Features, from the "Some features are turned off" line. */
  onManageFeatures?: () => void;
}

/**
 * Settings > Profile & Account > Tabs: show or hide the main website tabs. A
 * tab of a feature turned off in Features is left out, with one line that
 * says so, and its own choice is kept for when the feature comes back.
 */
export const WebTabsSettings = ({ onManageFeatures }: WebTabsSettingsProps) => {
  const { t } = useTranslation();
  const { hidden, editState, reload } = useHiddenWebTabs();
  const { setTabHidden } = useSetWebTabHidden();
  const { data: cycleSettings } = useCycleSettings();
  const { isEnabled: isFeatureOn } = useWebFeatures();
  // Challenges is offered only while the admin switch is on.
  const { available: challengesAvailable } = useChallengesAvailable();
  const tabIds = WEB_HIDEABLE_TAB_IDS.filter(
    (id) => id !== 'challenges' || challengesAvailable
  );
  const shownTabIds = tabIds.filter((id) =>
    isShownByFeature(webTabFeature(id), isFeatureOn)
  );
  // Cycle has no switch here; its row shows only while cycle is on, and only
  // once its settings are known (until then discreet mode is unknown too, and
  // the row could name cycle).
  const cycleOn = cycleSettings !== undefined && isFeatureOn('cycle');
  const someFeaturesOff =
    shownTabIds.length < tabIds.length ||
    (cycleSettings !== undefined && !cycleOn);

  return (
    <>
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.webTabs.description',
          'Choose which main tabs show on the website'
        )}
      >
        <PanelsTopLeft className="h-5 w-5" />
        {t('settings.webTabs.title', 'Tabs')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        {editState === 'actingOnBehalf' && (
          <p className="text-sm text-muted-foreground">
            {t(
              'settings.webTabs.actingOnBehalf',
              'You can only change the tabs on your own account.'
            )}
          </p>
        )}
        {editState === 'loadFailed' && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">
              {t(
                'settings.webTabs.loadError',
                'Could not load your tab choices.'
              )}
            </p>
            <Button variant="outline" size="sm" onClick={reload}>
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        )}
        {shownTabIds.map((id) => {
          const switchId = `web-tab-${id}`;
          return (
            <div key={id} className="flex items-center justify-between gap-4">
              <Label htmlFor={switchId} className="flex items-center gap-2">
                <TabIcon icon={webTabIcon(id)} />
                {webTabLabel(t, id)}
              </Label>
              <Switch
                id={switchId}
                checked={!hidden.has(id)}
                disabled={editState !== 'ready'}
                onCheckedChange={(visible) => setTabHidden(id, !visible)}
              />
            </div>
          );
        })}
        {cycleOn && (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-sm font-medium">
                <TabIcon icon={cycleTabIcon(cycleSettings)} />
                {cycleTabLabel(t, cycleSettings)}
              </span>
              <span className="text-sm text-muted-foreground">
                {t('settings.webTabs.cycleOn', 'On')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                'settings.webTabs.cycleHint',
                '{{name}} is turned on or off in Features, above.',
                { name: cycleTabLabel(t, cycleSettings) }
              )}
            </p>
          </>
        )}
        {/* Someone acting for the owner cannot change their features. */}
        {someFeaturesOff && editState !== 'actingOnBehalf' && (
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>
              {t(
                'settings.webTabs.someFeaturesOff',
                'Some features are turned off'
              )}
            </span>
            {onManageFeatures && (
              <>
                <span aria-hidden="true">·</span>
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onClick={onManageFeatures}
                >
                  {t('settings.webTabs.manageFeatures', 'Manage')}
                </Button>
              </>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.webTabs.footnote',
            'Diary and Settings always show. Hiding a tab only changes this website: nothing is deleted, and the mobile app keeps its own settings.'
          )}
        </p>
      </AccordionContent>
    </>
  );
};
