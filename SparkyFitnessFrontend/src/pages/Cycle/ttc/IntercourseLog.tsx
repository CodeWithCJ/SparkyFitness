import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface IntercourseLogProps {
  value: boolean | null;
  protectedValue: boolean | null;
  onChange: (value: boolean | null, protectedValue: boolean | null) => void;
}

export default function IntercourseLog({
  value,
  protectedValue,
  onChange,
}: IntercourseLogProps) {
  const { t } = useTranslation();
  const [showProtected, setShowProtected] = useState(!!value);

  const handleToggle = () => {
    const nextVal = !value;
    onChange(nextVal ? true : null, nextVal ? (protectedValue ?? false) : null);
    if (nextVal) {
      setShowProtected(true);
    } else {
      setShowProtected(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
        <button
          type="button"
          onClick={handleToggle}
          className="flex flex-1 items-center gap-3 text-sm focus:outline-none text-left"
        >
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full border transition',
              value
                ? 'border-rose-300 bg-rose-50 text-rose-500 dark:bg-rose-950/30'
                : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'
            )}
          >
            <Heart className={cn('h-5 w-5', value && 'fill-rose-500')} />
          </div>
          <div>
            <p className="font-medium text-sm">
              {t('cycle.log.intercourse', 'Intercourse')}
            </p>
            <p className="text-xs text-muted-foreground">
              {value
                ? t('cycle.log.intercourseLogged', 'Logged')
                : t('cycle.log.intercourseNotLogged', 'Not logged')}
            </p>
          </div>
        </button>
      </div>

      {showProtected && value && (
        <div className="flex items-center gap-2 pl-12 pr-3 py-1">
          <Checkbox
            id="protected-intercourse"
            checked={!!protectedValue}
            onCheckedChange={(checked) =>
              onChange(value, checked === true ? true : false)
            }
          />
          <Label
            htmlFor="protected-intercourse"
            className="text-xs text-muted-foreground cursor-pointer"
          >
            {t(
              'cycle.log.protectedIntercourse',
              'Protected intercourse (condom/barrier)'
            )}
          </Label>
        </div>
      )}
    </div>
  );
}
