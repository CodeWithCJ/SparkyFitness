import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useCreateCustomNutrientMutation } from '@/hooks/Foods/useCustomNutrients';
import { AliasChipInput } from './AliasChipInput';

interface CustomNutrientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  initialUnit?: string;
  initialAliases?: string[];
  // Fires with the created nutrient's name and unit after a successful create.
  onCreated?: (name: string, unit: string) => void;
}

/**
 * Shared "create custom nutrient" dialog (name, unit, provider aliases). Used by
 * the Settings screen's flow and by the provider nutrient viewer so both go
 * through the same create + display-preference refresh path. Fields can be
 * prefilled (e.g. from a provider field) and edited before saving.
 */
export const CustomNutrientDialog = ({
  open,
  onOpenChange,
  initialName = '',
  initialUnit = '',
  initialAliases = [],
  onCreated,
}: CustomNutrientDialogProps) => {
  const { toast } = useToast();
  const { loadNutrientDisplayPreferences } = usePreferences();
  const { mutateAsync: createCustomNutrient, isPending } =
    useCreateCustomNutrientMutation();

  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState(initialUnit);
  const [aliases, setAliases] = useState<string[]>(initialAliases);

  // Reset the fields to the provided initial values each time the dialog opens.
  useEffect(() => {
    if (open) {
      setName(initialName);
      setUnit(initialUnit);
      setAliases(initialAliases);
    }
    // Only re-seed on open; initial props are captured at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    if (!name.trim() || !unit.trim()) {
      toast({
        title: 'Error',
        description: 'Nutrient name and unit are required.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await createCustomNutrient({
        name: name.trim(),
        unit: unit.trim(),
        aliases,
      });
      await loadNutrientDisplayPreferences();
      onCreated?.(name.trim(), unit.trim());
      toast({
        title: 'Custom nutrient created',
        description: `"${name.trim()}" was added.`,
      });
      onOpenChange(false);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to create custom nutrient. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Custom Nutrient</DialogTitle>
          <DialogDescription>
            Set the display unit and the provider names (aliases) that should
            import into this nutrient.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="customNutrientName">Nutrient Name</Label>
            <Input
              id="customNutrientName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Magnesium"
            />
          </div>
          <div>
            <Label htmlFor="customNutrientUnit">Unit</Label>
            <Input
              id="customNutrientUnit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g., mg, µg, IU"
            />
          </div>
          <div>
            <Label>Provider aliases</Label>
            <AliasChipInput
              value={aliases}
              onChange={setAliases}
              placeholder="Type a name, press Enter"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Adding…' : 'Add Custom Nutrient'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomNutrientDialog;
