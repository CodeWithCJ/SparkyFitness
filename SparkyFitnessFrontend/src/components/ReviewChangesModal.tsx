import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { diffChars } from 'diff';

interface ReviewChangesModalProps<T> {
  isOpen: boolean;
  onClose: () => void;
  itemType: 'food' | 'exercise' | 'meal';
  oldData: T;
  newData: T;
  onAccept: (itemId: string) => void;
  onIgnore: (itemId: string) => void;
}

const renderDiff = (oldStr: string, newStr: string) => {
  const differences = diffChars(oldStr, newStr);
  return (
    <p>
      {differences.map((part, index) => (
        <span
          key={index}
          className={
            part.added ? 'bg-green-200' : part.removed ? 'bg-red-200 line-through' : ''
          }
        >
          {part.value}
        </span>
      ))}
    </p>
  );
};

const ReviewChangesModal = <T extends { id: string; name: string }>({
  isOpen,
  onClose,
  itemType,
  oldData,
  newData,
  onAccept,
  onIgnore,
}: ReviewChangesModalProps<T>) => {
  if (!oldData || !newData) {
    return null;
  }

  const fields = Object.keys(newData).filter(key => key !== 'id' && key !== 'updated_at' && key !== 'created_at');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Review Changes for {newData.name}</DialogTitle>
          <DialogDescription>
            The owner has updated this {itemType}. Review the changes below and decide whether to accept them.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-3 gap-4 font-semibold">
            <div>Field</div>
            <div>Old Version</div>
            <div>New Version</div>
          </div>
          {fields.map((key) => {
            const oldValue = (oldData as any)[key];
            const newValue = (newData as any)[key];
            if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
              return null;
            }
            return (
              <div key={key} className="grid grid-cols-3 gap-4 items-start">
                <div className="font-medium capitalize">{key.replace(/_/g, ' ')}</div>
                <div>{renderDiff(JSON.stringify(oldValue, null, 2), JSON.stringify(newValue, null, 2))}</div>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={() => onIgnore(newData.id)}>Ignore Update</Button>
          <Button onClick={() => onAccept(newData.id)}>Accept Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReviewChangesModal;