import { useTranslation } from 'react-i18next';
import { CERVICAL_POSITION_OPTIONS } from '@workspace/shared';
import { cn } from '@/lib/utils';

interface CervicalPositionPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function CervicalPositionPicker({
  value,
  onChange,
}: CervicalPositionPickerProps) {
  const { t } = useTranslation();

  const parts = value ? value.split('-') : [];
  const currentPos = parts[0] || null;
  const currentFirm = parts[1] || null;
  const currentOpen = parts[2] || null;

  const handleSelect = (
    type: 'position' | 'firmness' | 'opening',
    val: string
  ) => {
    let nextPos = currentPos;
    let nextFirm = currentFirm;
    let nextOpen = currentOpen;

    if (type === 'position') {
      nextPos = currentPos === val ? null : val;
    } else if (type === 'firmness') {
      nextFirm = currentFirm === val ? null : val;
    } else if (type === 'opening') {
      nextOpen = currentOpen === val ? null : val;
    }

    if (!nextPos && !nextFirm && !nextOpen) {
      onChange(null);
    } else {
      onChange(
        `${nextPos || 'medium'}-${nextFirm || 'medium'}-${nextOpen || 'closed'}`
      );
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-muted bg-muted/20 p-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t('cycle.log.cervicalPositionTitle', 'Cervical Position')}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Height/Position */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground text-center">
            {t('cycle.log.cervicalPositionHeight', 'Height')}
          </p>
          <div className="flex flex-col gap-1">
            {CERVICAL_POSITION_OPTIONS.position.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect('position', opt.value)}
                className={cn(
                  'rounded-lg border px-2 py-1.5 text-xs text-center transition font-medium',
                  currentPos === opt.value
                    ? 'border-primary bg-primary/10 text-primary-foreground font-semibold'
                    : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                {opt.displayName}
              </button>
            ))}
          </div>
        </div>

        {/* Firmness */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground text-center">
            {t('cycle.log.cervicalPositionFirmness', 'Firmness')}
          </p>
          <div className="flex flex-col gap-1">
            {CERVICAL_POSITION_OPTIONS.firmness.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect('firmness', opt.value)}
                className={cn(
                  'rounded-lg border px-2 py-1.5 text-xs text-center transition font-medium',
                  currentFirm === opt.value
                    ? 'border-primary bg-primary/10 text-primary-foreground font-semibold'
                    : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                {opt.displayName}
              </button>
            ))}
          </div>
        </div>

        {/* Opening */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground text-center">
            {t('cycle.log.cervicalPositionOpening', 'Opening')}
          </p>
          <div className="flex flex-col gap-1">
            {CERVICAL_POSITION_OPTIONS.opening.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect('opening', opt.value)}
                className={cn(
                  'rounded-lg border px-2 py-1.5 text-xs text-center transition font-medium',
                  currentOpen === opt.value
                    ? 'border-primary bg-primary/10 text-primary-foreground font-semibold'
                    : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                {opt.displayName}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
