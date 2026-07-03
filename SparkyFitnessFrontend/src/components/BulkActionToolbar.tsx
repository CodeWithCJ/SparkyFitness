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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl px-4 py-3 flex items-center justify-between animate-in fade-in slide-in-from-bottom-8 duration-300">
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
          <X className="h-4 w-4 mr-1.5" />
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          className="rounded-xl shadow-sm px-4"
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          {t('common.delete', 'Delete')}
        </Button>
      </div>
    </div>
  );
};

export default BulkActionToolbar;
