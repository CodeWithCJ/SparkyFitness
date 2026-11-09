import { useTranslation } from 'react-i18next';
import { PanelsTopLeft, type LucideIcon } from 'lucide-react';
import { WEB_HIDEABLE_TAB_IDS } from '@workspace/shared';
import { AccordionContent, AccordionTrigger } from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCycleSettings } from '@/hooks/useCycle';
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
  const { hidden, isLoading } = useHiddenWebTabs();
  const { setTabHidden } = useSetWebTabHidden();
  const { data: cycleSettings } = useCycleSettings();

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
                disabled={isLoading}
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
            {cycleSettings?.enabled
              ? t('settings.webTabs.cycleOn', 'On')
              : t('settings.webTabs.cycleOff', 'Off')}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.webTabs.cycleHint',
            '{{name}} has its own on/off switch in the Wellness settings tab.',
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
