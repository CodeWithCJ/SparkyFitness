import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, X } from 'lucide-react';

interface BulkActionToolbarProps {
  selectedCount: number;
  totalCount: number;
  onDelete: () => void;
  onClear: () => void;
  onSelectAll: (checked: boolean) => void;
  allSelected: boolean;
}

const BulkActionToolbar: React.FC<BulkActionToolbarProps> = ({
  selectedCount,
  totalCount,
  onDelete,
  onClear,
  onSelectAll,
  allSelected,
}) => {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 start-1/2 z-50 flex w-[90%] max-w-2xl -translate-x-1/2 animate-in items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-2xl duration-300 fade-in slide-in-from-bottom-8 rtl:translate-x-1/2 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <Checkbox
          id="select-all-toolbar"
          checked={allSelected}
          onCheckedChange={onSelectAll}
          className="h-5 w-5 rounded-md"
        />
        <div className="flex flex-col">
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {t('common.selectedCount', {
              count: selectedCount,
              defaultValue: `${selectedCount} selected`,
            })}
          </span>
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
            {t('common.outOfTotal', {
              total: totalCount,
              defaultValue: `out of ${totalCount} items`,
            })}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          className="rounded-xl shadow-sm px-4"
        >
          <Trash2 className="h-4 w-4" />
          {t('common.delete', 'Delete')}
        </Button>
      </div>
    </div>
  );
};

export default BulkActionToolbar;
