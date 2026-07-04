import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FOOD_SAFETY,
  MED_SAFETY,
  lookupSafety,
  type SafetyItem,
  type SafetyStatus,
} from '@workspace/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Check, AlertTriangle, XCircle } from 'lucide-react';

const STATUS_META: Record<
  SafetyStatus,
  { label: string; className: string; icon: typeof Check }
> = {
  safe: {
    label: 'Safe',
    className: 'text-emerald-600 bg-emerald-500/10',
    icon: Check,
  },
  caution: {
    label: 'Caution',
    className: 'text-amber-600 bg-amber-500/10',
    icon: AlertTriangle,
  },
  avoid: {
    label: 'Avoid',
    className: 'text-red-600 bg-red-500/10',
    icon: XCircle,
  },
};

export default function FoodMedSafetySearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'food' | 'meds'>('food');

  const list = tab === 'food' ? FOOD_SAFETY : MED_SAFETY;
  const results = useMemo(() => {
    if (!query.trim()) return list.slice(0, 8) as readonly SafetyItem[];
    return lookupSafety(query, list);
  }, [query, list]);

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <p className="text-sm font-medium">
          {t('pregnancy.safety.title', 'Food & medication safety')}
        </p>
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {(['food', 'meds'] as const).map((tb) => (
            <button
              key={tb}
              type="button"
              onClick={() => setTab(tb)}
              aria-pressed={tab === tb}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm transition',
                tab === tb
                  ? 'bg-background font-medium shadow-sm'
                  : 'text-muted-foreground'
              )}
            >
              {tb === 'food'
                ? t('pregnancy.safety.food', 'Foods')
                : t('pregnancy.safety.meds', 'Medications')}
            </button>
          ))}
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            tab === 'food'
              ? t(
                  'pregnancy.safety.foodPlaceholder',
                  'Can I eat… (e.g. tuna, brie)'
                )
              : t(
                  'pregnancy.safety.medPlaceholder',
                  'Can I take… (e.g. ibuprofen)'
                )
          }
        />
        <div className="space-y-1.5">
          {results.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('pregnancy.safety.noResults', 'No matches. Try another term.')}
            </p>
          ) : (
            results.map((item) => {
              const meta = STATUS_META[item.status];
              const Icon = meta.icon;
              return (
                <div key={item.name} className="rounded-lg border p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.name}</span>
                    <span
                      className={cn(
                        'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        meta.className
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {t(`pregnancy.safety.status.${item.status}`, meta.label)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.note}
                  </p>
                </div>
              );
            })
          )}
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          {t(
            'pregnancy.safety.disclaimer',
            'General guidance only — always confirm with your provider.'
          )}
        </p>
      </CardContent>
    </Card>
  );
}
