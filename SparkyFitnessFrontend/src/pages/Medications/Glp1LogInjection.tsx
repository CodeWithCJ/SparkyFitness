import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Syringe } from 'lucide-react';
import { INJECTION_SITES, localDateTimeToUtc } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';
import InjectionSitePicker from './InjectionSitePicker';
import { useInjectionSiteSelection } from '@/hooks/useInjectionSiteSelection';
import InjectionSiteSettings from './InjectionSiteSettings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useMedicationPens,
  useLogInjectionMutation,
} from '@/hooks/useMedications';
import type { Medication } from '@/types/medications';

interface Glp1LogInjectionProps {
  med: Medication;
}

export default function Glp1LogInjection({ med }: Glp1LogInjectionProps) {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const medId = med.id;

  const pensQ = useMedicationPens(medId);
  const logMutation = useLogInjectionMutation(medId);

  const siteSelection = useInjectionSiteSelection(medId);
  const { sitesQ, site, setSelectedSite } = siteSelection;

  const inUsePen = pensQ.data?.find(
    (p) => p.status === 'in_use' || p.status === 'sealed'
  );

  const [doseMg, setDoseMg] = useState(
    med.dose_amount != null ? String(med.dose_amount) : ''
  );
  const [injectedAt, setInjectedAt] = useState('');
  const [injectionNotes, setInjectionNotes] = useState('');
  const [penChoice, setPenChoice] = useState<string | null>(null);
  const effectivePenId = penChoice ?? inUsePen?.id ?? 'none';

  const handleLog = () => {
    const willDeduct = effectivePenId !== 'none';
    logMutation.mutate(
      {
        medication_id: medId,
        site,
        dose_mg: doseMg ? Number(doseMg) : (med.dose_amount ?? null),
        injected_at: injectedAt
          ? localDateTimeToUtc(injectedAt, timezone).toISOString()
          : undefined,
        pen_id: willDeduct ? effectivePenId : null,
        deduct_pen: willDeduct,
        notes: injectionNotes.trim() || null,
      },
      {
        onSuccess: () => {
          setSelectedSite(null);
          setInjectedAt('');
          setInjectionNotes('');
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Syringe className="h-4 w-4 text-blue-500" />{' '}
          {t('medications.glp1.logInjection', 'Log injection')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">
              {t('medications.glp1.injectionSite', 'Injection site')} ·{' '}
              <span className="text-green-600">
                {t('medications.glp1.legendSuggested', 'green = suggested')}
              </span>
              ,{' '}
              <span className="text-amber-600">
                {t(
                  'medications.glp1.legendResting',
                  'amber = resting <{{days}}d',
                  { days: sitesQ.data?.restDays ?? 7 }
                )}
              </span>
            </Label>
            <InjectionSiteSettings />
          </div>
          <div className="mt-2">
            <InjectionSitePicker selection={siteSelection} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t('medications.glp1.doseMg', 'Dose (mg)')}
            </Label>
            <Input
              type="number"
              step="0.05"
              value={doseMg}
              onChange={(e) => setDoseMg(e.target.value)}
              placeholder={
                med.dose_amount != null ? String(med.dose_amount) : '0'
              }
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {t('medications.glp1.dateTime', 'Date & time')}
            </Label>
            <Input
              type="datetime-local"
              value={injectedAt}
              onChange={(e) => setInjectedAt(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            {t('medications.glp1.deduct', 'Deduct from pen/vial')}
          </Label>
          <Select value={effectivePenId} onValueChange={(v) => setPenChoice(v)}>
            <SelectTrigger>
              <SelectValue
                placeholder={t('medications.glp1.dontDeduct', "Don't deduct")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t('medications.glp1.dontDeduct', "Don't deduct")}
              </SelectItem>
              {(pensQ.data ?? [])
                .filter((p) => p.status !== 'finished')
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.kind}
                    {p.dose_mg ? ` ${p.dose_mg}mg` : ''} ·{' '}
                    {(p.doses_total ?? 0) - p.doses_used} left
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            {t('medications.glp1.notes', 'Notes')}
          </Label>
          <Input
            value={injectionNotes}
            onChange={(e) => setInjectionNotes(e.target.value)}
            placeholder={t(
              'medications.glp1.notesPlaceholder',
              'e.g. Mild stinging, felt fine'
            )}
          />
        </div>

        <Button
          onClick={handleLog}
          disabled={!site || logMutation.isPending}
          className="w-full"
        >
          {logMutation.isPending
            ? t('medications.common.logging', 'Logging…')
            : site
              ? t(
                  'medications.glp1.logInjectionAt',
                  'Log injection — {{site}}',
                  {
                    site: t(
                      'medications.sites.label.' + site,
                      INJECTION_SITES.find((s) => s.id === site)?.label ?? site
                    ),
                  }
                )
              : t('medications.glp1.logInjection', 'Log injection')}
        </Button>
      </CardContent>
    </Card>
  );
}
