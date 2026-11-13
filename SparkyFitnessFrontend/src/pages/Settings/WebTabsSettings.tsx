import { useTranslation } from 'react-i18next';
import { PanelsTopLeft, type LucideIcon } from 'lucide-react';
import { WEB_HIDEABLE_TAB_IDS } from '@workspace/shared';
import { AccordionContent, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCycleSettings } from '@/hooks/useCycle';
import { useWebFeatures } from '@/hooks/Settings/useWebFeatures';
import {
  useHiddenWebTabs,
  useSetWebTabHidden,
} from '@/hooks/Settings/useHiddenWebTabs';
import {
  cycleTabIcon,
  cycleTabLabel,
  webTabIcon,
  webTabLabel,
} from '@/constants/webTabs';

function TabIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}

/** Settings > Profile & Account > Tabs: show or hide the main website tabs. */
export const WebTabsSettings = () => {
  const { t } = useTranslation();
  const { hidden, editState, reload } = useHiddenWebTabs();
  const { setTabHidden } = useSetWebTabHidden();
  const { data: cycleSettings } = useCycleSettings();
  const { isEnabled: isFeatureOn } = useWebFeatures();

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
        {WEB_HIDEABLE_TAB_IDS.map((id) => {
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
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-sm font-medium">
            <TabIcon icon={cycleTabIcon(cycleSettings)} />
            {cycleTabLabel(t, cycleSettings)}
          </span>
          <span className="text-sm text-muted-foreground">
            {isFeatureOn('cycle')
              ? t('settings.webTabs.cycleOn', 'On')
              : t('settings.webTabs.cycleOff', 'Off')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.webTabs.cycleHint',
            '{{name}} is turned on or off in Features, above.',
            { name: cycleTabLabel(t, cycleSettings) }
          )}
        </p>
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
