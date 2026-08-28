import { useTranslation } from 'react-i18next';
import { Trash2, RotateCcw, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { EstimateMacros } from '@workspace/shared';
import type { IngredientDraftRow } from './useFoodPhotoIngredientDraft';

/**
 * The editable ingredient list.
 *
 * Web has the width mobile does not, so every field sits inline in a column
 * rather than behind an accordion — the user sees all six macros for every row
 * at once and edits in place.
 */

const MACRO_COLUMNS: { key: keyof EstimateMacros; labelKey: string }[] = [
  { key: 'calories_kcal', labelKey: 'foodPhoto.columns.calories' },
  { key: 'protein_g', labelKey: 'foodPhoto.columns.protein' },
  { key: 'carbs_g', labelKey: 'foodPhoto.columns.carbs' },
  { key: 'fat_g', labelKey: 'foodPhoto.columns.fat' },
  { key: 'fiber_g', labelKey: 'foodPhoto.columns.fiber' },
  { key: 'sugar_g', labelKey: 'foodPhoto.columns.sugar' },
];

const CONFIDENCE_VARIANT: Record<
  IngredientDraftRow['confidence'],
  'default' | 'secondary' | 'destructive'
> = {
  high: 'default',
  medium: 'secondary',
  low: 'destructive',
};

function display(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(Math.round(value * 100) / 100);
}

function parseNumeric(raw: string): number {
  if (raw.trim() === '') return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export interface FoodPhotoIngredientTableProps {
  rows: IngredientDraftRow[];
  totals: EstimateMacros;
  totalGrams: number;
  onChangeGrams: (id: string, grams: number) => void;
  onChangeName: (id: string, name: string) => void;
  onChangeMacro: (id: string, key: keyof EstimateMacros, value: number) => void;
  onRemove: (id: string) => void;
  onApplyMatch: (id: string) => void;
  onClearMatch: (id: string) => void;
  onRecalcFromGrams: (id: string) => void;
}

const FoodPhotoIngredientTable = ({
  rows,
  totals,
  totalGrams,
  onChangeGrams,
  onChangeName,
  onChangeMacro,
  onRemove,
  onApplyMatch,
  onClearMatch,
  onRecalcFromGrams,
}: FoodPhotoIngredientTableProps) => {
  const { t } = useTranslation();

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        {t('foodPhoto.emptyIngredients', {
          defaultValue:
            'Every ingredient was removed. Switch to "One food" to log the plate as a single entry.',
        })}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-2 font-medium">
              {t('foodPhoto.columns.ingredient', {
                defaultValue: 'Ingredient',
              })}
            </th>
            <th className="py-2 px-2 font-medium w-24">
              {t('foodPhoto.columns.grams', { defaultValue: 'Grams' })}
            </th>
            {MACRO_COLUMNS.map((column) => (
              <th key={column.key} className="py-2 px-2 font-medium w-24">
                {t(column.labelKey)}
              </th>
            ))}
            <th className="py-2 pl-2 w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b align-top">
              <td className="py-2 pr-2">
                <Input
                  value={row.name}
                  onChange={(event) => onChangeName(row.id, event.target.value)}
                  aria-label={t('foodPhoto.columns.ingredient', {
                    defaultValue: 'Ingredient',
                  })}
                />
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={CONFIDENCE_VARIANT[row.confidence]}>
                    {t(`foodPhoto.confidence.${row.confidence}`)}
                  </Badge>
                  {row.preparation ? (
                    <span className="text-xs text-muted-foreground">
                      {row.preparation}
                    </span>
                  ) : null}
                  {/* Only offered when the matched variant can actually be
                      gram-scaled; otherwise there is nothing to swap in. */}
                  {row.match?.scaled ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() =>
                        row.matchApplied
                          ? onClearMatch(row.id)
                          : onApplyMatch(row.id)
                      }
                    >
                      {row.matchApplied ? (
                        <Check className="h-3 w-3 mr-1" />
                      ) : null}
                      {row.matchApplied
                        ? t('foodPhoto.match.using', {
                            defaultValue: 'Using {{name}}',
                            name: row.match.food_name,
                          })
                        : t('foodPhoto.match.use', {
                            defaultValue: 'Use {{name}} from your foods',
                            name: row.match.food_name,
                          })}
                    </Button>
                  ) : null}
                  {row.manualOverride ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => onRecalcFromGrams(row.id)}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      {t('foodPhoto.recalcFromGrams', {
                        defaultValue: 'Recalculate from grams',
                      })}
                    </Button>
                  ) : null}
                </div>
              </td>
              <td className="py-2 px-2">
                <Input
                  type="number"
                  min={0}
                  value={display(row.grams)}
                  onChange={(event) =>
                    onChangeGrams(row.id, parseNumeric(event.target.value))
                  }
                  aria-label={t('foodPhoto.columns.gramsFor', {
                    defaultValue: 'Grams for {{name}}',
                    name: row.name,
                  })}
                />
              </td>
              {MACRO_COLUMNS.map((column) => (
                <td key={column.key} className="py-2 px-2">
                  <Input
                    type="number"
                    min={0}
                    value={display(row.macros[column.key])}
                    onChange={(event) =>
                      onChangeMacro(
                        row.id,
                        column.key,
                        parseNumeric(event.target.value)
                      )
                    }
                    aria-label={`${t(column.labelKey)} — ${row.name}`}
                  />
                </td>
              ))}
              <td className="py-2 pl-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(row.id)}
                  aria-label={t('foodPhoto.removeIngredient', {
                    defaultValue: 'Remove {{name}}',
                    name: row.name,
                  })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td className="py-2 pr-2">
              {t('foodPhoto.columns.total', { defaultValue: 'Total' })}
            </td>
            <td className="py-2 px-2">{Math.round(totalGrams)}</td>
            {MACRO_COLUMNS.map((column) => (
              <td key={column.key} className="py-2 px-2">
                {Math.round(totals[column.key])}
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default FoodPhotoIngredientTable;
