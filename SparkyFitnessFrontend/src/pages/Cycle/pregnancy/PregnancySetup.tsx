import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { eddFromLmp, eddFromConception } from '@workspace/shared';
import { useCreatePregnancyMutation } from '@/hooks/usePregnancy';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Baby } from 'lucide-react';

type Basis = 'due_date' | 'lmp' | 'conception';

export default function PregnancySetup() {
  const { t } = useTranslation();
  const create = useCreatePregnancyMutation();
  const [basis, setBasis] = useState<Basis>('lmp');
  const [dateValue, setDateValue] = useState('');
  const [fetusCount, setFetusCount] = useState(1);

  const previewDue =
    dateValue && basis === 'lmp'
      ? eddFromLmp(dateValue)
      : dateValue && basis === 'conception'
        ? eddFromConception(dateValue)
        : dateValue || null;

  const submit = () => {
    if (!dateValue) return;
    const body =
      basis === 'due_date'
        ? {
            fetus_count: fetusCount,
            due_date: dateValue,
            due_date_basis: 'manual' as const,
          }
        : basis === 'lmp'
          ? {
              fetus_count: fetusCount,
              lmp_date: dateValue,
              due_date_basis: 'lmp' as const,
            }
          : {
              fetus_count: fetusCount,
              conception_date: dateValue,
              due_date_basis: 'conception' as const,
            };
    create.mutate(body);
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Baby className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>
            {t('pregnancy.setup.title', 'Start pregnancy tracking')}
          </CardTitle>
          <CardDescription>
            {t(
              'pregnancy.setup.subtitle',
              'Tell us how to estimate your due date — you can adjust it later.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['lmp', t('pregnancy.setup.lmp', 'Last period')],
                ['due_date', t('pregnancy.setup.dueDate', 'Due date')],
                ['conception', t('pregnancy.setup.conception', 'Conception')],
              ] as [Basis, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setBasis(value)}
                aria-pressed={basis === value}
                className={cn(
                  'rounded-xl border p-2 text-xs transition',
                  basis === value
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-transparent bg-muted/40 hover:bg-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <Label htmlFor="preg-date">
              {basis === 'due_date'
                ? t('pregnancy.setup.dueDateLabel', 'Due date')
                : basis === 'lmp'
                  ? t('pregnancy.setup.lmpLabel', 'First day of last period')
                  : t(
                      'pregnancy.setup.conceptionLabel',
                      'Conception / ovulation date'
                    )}
            </Label>
            <Input
              id="preg-date"
              type="date"
              value={dateValue}
              onChange={(e) => setDateValue(e.target.value)}
            />
          </div>

          <div>
            <Label>{t('pregnancy.setup.babies', 'Number of babies')}</Label>
            <div className="mt-1 flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setFetusCount(n)}
                  aria-pressed={fetusCount === n}
                  className={cn(
                    'flex-1 rounded-xl border py-2 text-sm transition',
                    fetusCount === n
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'border-transparent bg-muted/40 hover:bg-muted'
                  )}
                >
                  {n === 1
                    ? t('pregnancy.setup.single', 'One')
                    : n === 2
                      ? t('pregnancy.setup.twins', 'Twins')
                      : t('pregnancy.setup.more', '3+')}
                </button>
              ))}
            </div>
          </div>

          {previewDue ? (
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-center text-sm">
              {t(
                'pregnancy.setup.estimatedDue',
                'Estimated due date: {{date}}',
                {
                  date: previewDue,
                }
              )}
            </p>
          ) : null}

          <Button
            className="w-full"
            disabled={!dateValue || create.isPending}
            onClick={submit}
          >
            {t('pregnancy.setup.start', 'Start tracking')}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            {t(
              'pregnancy.setup.disclaimer',
              'Estimates are informational and not a substitute for medical care.'
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
