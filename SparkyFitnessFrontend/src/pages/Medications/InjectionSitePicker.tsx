import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { INJECTION_SITES } from '@workspace/shared';
import InjectionSiteBodyMap from './InjectionSiteBodyMap';
import type { InjectionSiteSelection } from '@/hooks/useInjectionSiteSelection';

interface InjectionSitePickerProps {
  selection: InjectionSiteSelection;
}

/**
 * Body map + selected-site label + lipohypertrophy warning for a selection from
 * useInjectionSiteSelection. Shared by the Cabinet log form and the Log-tab
 * quick prompt so site-picking behaves identically in both.
 */
export default function InjectionSitePicker({
  selection,
}: InjectionSitePickerProps) {
  const { t } = useTranslation();
  const {
    sitesQ,
    site,
    setSelectedSite,
    suggestedSite,
    restingSites,
    mapSites,
  } = selection;

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <InjectionSiteBodyMap
          sites={mapSites}
          selectedSiteId={site}
          suggestedSiteId={suggestedSite}
          restingSiteIds={sitesQ.data?.restingSiteIds ?? []}
          onSelect={setSelectedSite}
        />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {t('medications.glp1.selected', 'Selected:')}
          </span>
          <span className="font-medium">
            {site
              ? t(
                  'medications.sites.label.' + site,
                  INJECTION_SITES.find((s) => s.id === site)?.label ?? site
                )
              : t('medications.glp1.tapZone', 'Tap a zone')}
          </span>
        </div>
      </div>
      {site && restingSites.has(site) && (
        <p className="mt-2 flex items-center gap-1 text-xs text-amber-600">
          <AlertTriangle className="h-3 w-3" />{' '}
          {t(
            'medications.glp1.lipoWarning',
            'This site was used recently — rotate to avoid lipohypertrophy.'
          )}
        </p>
      )}
    </>
  );
}
