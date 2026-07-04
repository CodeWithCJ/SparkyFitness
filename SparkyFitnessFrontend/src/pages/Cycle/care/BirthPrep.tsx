import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BIRTH_PLAN_QUESTIONS, HOSPITAL_BAG_ITEMS } from '@workspace/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, Circle, ClipboardList, Luggage, Printer } from 'lucide-react';

// Birth plan & hospital bag are personal, low-stakes prep — stored locally to
// avoid extra tables. (A future migration could persist these server-side.)
const PLAN_KEY = 'cycle.birthPlan';
const BAG_KEY = 'cycle.hospitalBag';

function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [key, value]);
  return [value, setValue];
}

export default function BirthPrep() {
  const { t } = useTranslation();
  const [plan, setPlan] = useLocalState<Record<string, string>>(PLAN_KEY, {});
  const [bag, setBag] = useLocalState<Record<string, boolean>>(BAG_KEY, {});

  const bagDone = HOSPITAL_BAG_ITEMS.filter((i) => bag[i.key]).length;

  const print = () => window.print();

  return (
    <div className="space-y-5">
      {/* Birth plan */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <ClipboardList className="h-4 w-4" />
            {t('cycle.care.birthPlan', 'Birth plan')}
          </p>
          <Button variant="ghost" size="sm" onClick={print}>
            <Printer className="mr-1 h-4 w-4" />
            {t('cycle.care.print', 'Print')}
          </Button>
        </div>
        {BIRTH_PLAN_QUESTIONS.map((q) => (
          <Card key={q.key}>
            <CardContent className="py-3">
              <p className="mb-2 text-sm font-medium">{q.question}</p>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() =>
                      setPlan({
                        ...plan,
                        [q.key]: plan[q.key] === opt ? '' : opt,
                      })
                    }
                    aria-pressed={plan[q.key] === opt}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition',
                      plan[q.key] === opt
                        ? 'border-primary bg-primary/10 font-medium'
                        : 'border-transparent bg-muted/40 hover:bg-muted'
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Hospital bag */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Luggage className="h-4 w-4" />
            {t('cycle.care.hospitalBag', 'Hospital bag')}
          </p>
          <span className="text-sm text-muted-foreground">
            {bagDone} / {HOSPITAL_BAG_ITEMS.length}
          </span>
        </div>
        <Card>
          <CardContent className="py-2">
            {HOSPITAL_BAG_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setBag({ ...bag, [item.key]: !bag[item.key] })}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-muted/40"
              >
                {bag[item.key] ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    bag[item.key] && 'text-muted-foreground line-through'
                  )}
                >
                  {item.title}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
