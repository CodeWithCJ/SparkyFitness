import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AutoCalculateToolbarProps {
  eligibleCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onApplySelected: () => void;
  disabled?: boolean;
}

export const AutoCalculateToolbar = ({
  eligibleCount,
  selectedCount,
  onSelectAll,
  onSelectNone,
  onApplySelected,
  disabled,
}: AutoCalculateToolbarProps) => {
  const { t } = useTranslation();

  if (eligibleCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 -mb-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onSelectAll}
        disabled={disabled}
      >
        {t('nutrition.autoCalculateSelectAll', 'Select All')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onSelectNone}
        disabled={disabled || selectedCount === 0}
      >
        {t('nutrition.autoCalculateSelectNone', 'Select None')}
      </Button>
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={onApplySelected}
        disabled={disabled || selectedCount === 0}
      >
        <Calculator className="h-3.5 w-3.5 mr-1.5" />
        {t(
          'nutrition.autoCalculateApplySelected',
          'Auto-calculate Selected ({{count}})',
          { count: selectedCount }
        )}
      </Button>
    </div>
  );
};
