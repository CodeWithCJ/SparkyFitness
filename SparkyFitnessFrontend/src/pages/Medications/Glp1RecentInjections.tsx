import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { INJECTION_SITES } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useMedicationInjections,
  useDeleteInjectionMutation,
} from '@/hooks/useMedications';
import { usePreferences } from '@/contexts/PreferencesContext';
import type { Medication } from '@/types/medications';

interface Glp1RecentInjectionsProps {
  med: Medication;
}

export default function Glp1RecentInjections({
  med,
}: Glp1RecentInjectionsProps) {
  const { t } = useTranslation();
  const { formatDate } = usePreferences();
  const medId = med.id;

  const injQ = useMedicationInjections(medId);
  const deleteInjMutation = useDeleteInjectionMutation(medId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t('medications.glp1.recentInjections', 'Recent injections')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(injQ.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('medications.glp1.noInjections', 'No injections logged yet.')}
          </p>
        )}
        {(injQ.data ?? []).slice(0, 8).map((inj) => (
          <div
            key={inj.id}
            className="flex items-center justify-between rounded-md border p-2 text-sm gap-2"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-medium truncate">
                {INJECTION_SITES.find((s) => s.id === inj.site)?.label ??
                  inj.site ??
                  '—'}
              </span>
              <span className="text-xs text-muted-foreground">
                {inj.dose_mg ? `${inj.dose_mg} mg · ` : ''}
                {formatDate(inj.injected_at)}
              </span>
              {inj.notes && (
                <span className="text-xs text-muted-foreground italic mt-0.5 block truncate">
                  Note: {inj.notes}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => deleteInjMutation.mutate(inj.id)}
              disabled={deleteInjMutation.isPending}
              aria-label="Delete injection entry"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
