import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface BulkDeleteDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  selectedCount: number;
  entityName?: string;
}

const BulkDeleteDialog: React.FC<BulkDeleteDialogProps> = ({
  isOpen,
  onOpenChange,
  onConfirm,
  selectedCount,
  entityName,
}) => {
  const { t } = useTranslation();

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('common.bulkDeleteTitle', {
              count: selectedCount,
              entity: entityName || t('common.items', 'items'),
              defaultValue: `Delete ${selectedCount} ${entityName || 'items'}?`,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('common.bulkDeleteDescription', {
              count: selectedCount,
              defaultValue: `Are you sure you want to delete these ${selectedCount} items? This action cannot be undone.`,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('common.delete', 'Delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default BulkDeleteDialog;
