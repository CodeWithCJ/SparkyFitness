import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { INJECTION_SITES } from '@workspace/shared';
import { ChevronUp, ChevronDown, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useMedicationDisplayPreferences,
  useUpsertMedicationDisplayPreferenceMutation,
} from '@/hooks/useMedicationDisplayPreferences';

const ALL_SITES = INJECTION_SITES.filter((s) => s.id !== 'unknown');

interface SiteRow {
  id: string;
  label: string;
  active: boolean;
}

/**
 * Lets the user pick which injection sites they use and in what order. Persists the ordered active
 * set to the `injection_sites` display preference; the GLP-1 coach body map and rotation suggestion
 * both honor it (server reads the same pref).
 */
export default function InjectionSiteSettings() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const prefsQ = useMedicationDisplayPreferences();
  const upsert = useUpsertMedicationDisplayPreferenceMutation();

  const initialRows = useMemo<SiteRow[]>(() => {
    const pref = prefsQ.data?.find((p) => p.view_group === 'injection_sites');
    const active = pref?.visible_items ?? [];
    if (!active.length) {
      return ALL_SITES.map((s) => ({ id: s.id, label: s.label, active: true }));
    }
    const labelById = new Map(ALL_SITES.map((s) => [s.id, s.label] as const));
    const activeRows: SiteRow[] = active
      .filter((id) => labelById.has(id))
      .map((id) => ({ id, label: labelById.get(id) as string, active: true }));
    const inactiveRows: SiteRow[] = ALL_SITES.filter(
      (s) => !active.includes(s.id)
    ).map((s) => ({ id: s.id, label: s.label, active: false }));
    return [...activeRows, ...inactiveRows];
  }, [prefsQ.data]);

  const [rows, setRows] = useState<SiteRow[]>(initialRows);

  const toggle = (id: string) =>
    setRows((r) =>
      r.map((row) => (row.id === id ? { ...row, active: !row.active } : row))
    );

  const move = (idx: number, dir: -1 | 1) =>
    setRows((r) => {
      const j = idx + dir;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      const rowI = next[idx];
      const rowJ = next[j];
      if (rowI && rowJ) {
        next[idx] = rowJ;
        next[j] = rowI;
      }
      return next;
    });

  const save = () => {
    const visibleItems = rows.filter((r) => r.active).map((r) => r.id);
    upsert.mutate(
      { viewGroup: 'injection_sites', platform: 'web', visibleItems },
      { onSuccess: () => setOpen(false) }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setRows(initialRows);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-1 h-3.5 w-3.5" />{' '}
          {t('medications.sites.customize', 'Customize sites')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('medications.sites.dialogTitle', 'Injection sites')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t(
            'medications.sites.subtitle',
            'Toggle the sites you use and order them — rotation suggestions follow this order.'
          )}
        </p>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-md border p-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <div className="flex flex-col text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    className="disabled:opacity-30"
                    aria-label={`Move ${row.label} up`}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={idx === rows.length - 1}
                    className="disabled:opacity-30"
                    aria-label={`Move ${row.label} down`}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                <span
                  className={
                    row.active ? '' : 'text-muted-foreground line-through'
                  }
                >
                  {t('medications.sites.label.' + row.id, row.label)}
                </span>
              </div>
              <Switch
                checked={row.active}
                onCheckedChange={() => toggle(row.id)}
                aria-label={`Toggle ${row.label}`}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={upsert.isPending}>
            {upsert.isPending
              ? t('medications.common.saving', 'Saving…')
              : t('medications.common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
