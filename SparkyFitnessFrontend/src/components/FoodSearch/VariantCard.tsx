import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Trash2, Check, Plus } from 'lucide-react';
import type { EquivalentUnit, GlycemicIndex } from '@/types/food';
import type { FormFoodVariant } from '@/utils/foodForm';
import { getConversionFactor } from '@/utils/servingSizeConversions';
import { UNIT_GROUPS } from '@/constants/foodForm';
import { UserCustomNutrient } from '@/types/customNutrient';
import { NutrientGrid } from './NutrientFormGrid';

interface VariantCardProps {
  index: number;
  variant: FormFoodVariant & { equivalents?: EquivalentUnit[] };
  variantError: string;
  visibleNutrients: string[];
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    from: 'kcal' | 'kJ',
    to: 'kcal' | 'kJ'
  ) => number;
  customNutrients?: UserCustomNutrient[];
  baseServingUnit: string;
  onUpdate: (
    index: number,
    field: string,
    value: string | number | boolean | GlycemicIndex | EquivalentUnit[]
  ) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
}

export function VariantCard({
  index,
  variant,
  variantError,
  visibleNutrients,
  energyUnit,
  convertEnergy,
  customNutrients,
  baseServingUnit,
  onUpdate,
  onDuplicate,
  onRemove,
}: VariantCardProps) {
  const equivalents = variant.equivalents ?? [];

  const addEquivalent = () => {
    onUpdate(index, 'equivalents', [
      ...equivalents,
      { serving_size: 1, serving_unit: '' },
    ]);
  };

  const updateEquivalent = (
    eqIndex: number,
    field: keyof EquivalentUnit,
    value: string | number
  ) => {
    const updated = [...equivalents];
    updated[eqIndex] = {
      ...updated[eqIndex],
      [field]: value,
    } as EquivalentUnit;
    onUpdate(index, 'equivalents', updated);
  };

  const removeEquivalent = (eqIndex: number) => {
    const updated = equivalents.filter((_, i) => i !== eqIndex);
    onUpdate(index, 'equivalents', updated);
  };

  return (
    <Card key={index} className="p-4">
      <div className="flex flex-col gap-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-wrap">
          <div className="flex items-end gap-2">
            <div className="flex flex-col">
              <Label htmlFor={`serving-size-${index}`}>Serving Size</Label>
              <Input
                id={`serving-size-${index}`}
                type="number"
                step="0.1"
                value={variant.serving_size}
                onChange={(e) =>
                  onUpdate(index, 'serving_size', Number(e.target.value))
                }
                className="w-24"
              />
            </div>

            <div className="flex flex-col">
              <Label htmlFor={`serving-unit-${index}`}>Unit Type</Label>
              <Select
                value={variant.serving_unit}
                onValueChange={(value) =>
                  onUpdate(index, 'serving_unit', value)
                }
              >
                <SelectTrigger id={`serving-unit-${index}`} className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.units.map((unit) => {
                        const compatible =
                          unit !== baseServingUnit &&
                          getConversionFactor(baseServingUnit, unit) !== null;
                        return (
                          <SelectItem key={unit} value={unit}>
                            <span className="flex items-center gap-1.5">
                              {unit}
                              {compatible && (
                                <Check className="h-3 w-3 text-green-500" />
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {variantError && (
            <p className="text-red-500 text-sm mt-1">{variantError}</p>
          )}

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center space-x-2">
              <Input
                type="checkbox"
                id={`is-default-${index}`}
                checked={variant.is_default ?? false}
                onChange={(e) =>
                  onUpdate(index, 'is_default', e.target.checked)
                }
                className="form-checkbox h-4 w-4 text-blue-600"
              />
              <Label htmlFor={`is-default-${index}`} className="text-sm">
                Default
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Input
                type="checkbox"
                id={`is-locked-${index}`}
                checked={variant.is_locked ?? false}
                onChange={(e) => onUpdate(index, 'is_locked', e.target.checked)}
                className="form-checkbox h-4 w-4 text-blue-600"
              />
              <Label htmlFor={`is-locked-${index}`} className="text-sm">
                Auto-Scale
              </Label>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto m:ml-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addEquivalent}
              title="Add Equivalent Unit"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDuplicate(index)}
              title="Duplicate Unit"
            >
              <Copy className="w-4 h-4" />
            </Button>
            {index > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemove(index)}
                title="Remove Unit"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {equivalents.map((eq, eqIndex) => (
          <div key={eqIndex} className="flex items-end gap-2 ">
            <div className="flex flex-col">
              <Label htmlFor={`eq-size-${index}-${eqIndex}`}>
                Equivalent Size
              </Label>
              <Input
                id={`eq-size-${index}-${eqIndex}`}
                type="number"
                step="0.1"
                value={eq.serving_size}
                onChange={(e) =>
                  updateEquivalent(
                    eqIndex,
                    'serving_size',
                    Number(e.target.value)
                  )
                }
                className="w-24"
              />
            </div>
            <div className="flex flex-col">
              <Label htmlFor={`eq-unit-${index}-${eqIndex}`}>Unit Type</Label>
              <Select
                value={eq.serving_unit}
                onValueChange={(value) =>
                  updateEquivalent(eqIndex, 'serving_unit', value)
                }
              >
                <SelectTrigger
                  id={`eq-unit-${index}-${eqIndex}`}
                  className="w-32"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_GROUPS.map((group) => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.units.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => removeEquivalent(eqIndex)}
              title="Remove Equivalent"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>

      <h4 className="text-md font-medium mb-2">
        Nutrition per {variant.serving_size} {variant.serving_unit}
      </h4>

      {/* Pass the array straight through */}
      <NutrientGrid
        variantIndex={index}
        variant={variant}
        visibleNutrients={visibleNutrients}
        energyUnit={energyUnit}
        convertEnergy={convertEnergy}
        customNutrients={customNutrients}
        onUpdate={onUpdate}
      />
    </Card>
  );
}
