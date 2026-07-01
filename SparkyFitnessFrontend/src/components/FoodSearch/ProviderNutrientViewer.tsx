import { useMemo, useState } from 'react';
import { ChevronDown, Check, Plus, ExternalLink } from 'lucide-react';
import { normalizeNutrientName } from '@workspace/shared';
import type { Food } from '@/types/food';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  useCustomNutrients,
  useUpdateCustomNutrientMutation,
} from '@/hooks/Foods/useCustomNutrients';
import { CustomNutrientDialog } from '@/components/Foods/CustomNutrientDialog';
import { getStandardNutrientId } from '@/constants/standardNutrientAliases';
import { CENTRAL_NUTRIENT_CONFIG } from '@/constants/nutrients';

// Public web page for a provider's food, so users can cross-check field names
// against the source. Only providers with a stable public URL are linked.
function getProviderFoodUrl(food: Food): string | null {
  switch (food.provider_type) {
    case 'usda':
      return food.provider_external_id
        ? `https://fdc.nal.usda.gov/food-details/${food.provider_external_id}/nutrients`
        : null;
    case 'openfoodfacts': {
      const code = food.barcode || food.provider_external_id;
      return code ? `https://world.openfoodfacts.org/product/${code}` : null;
    }
    default:
      return null;
  }
}

interface ProviderNutrientViewerProps {
  food?: Food;
  // Fill the matched nutrient's value onto the food being imported, using the
  // provider field the user just mapped (converted into nutrientUnit when known).
  onApplyMatch?: (
    nutrientName: string,
    providerLabel: string,
    nutrientUnit?: string
  ) => void;
}

/**
 * Shows the exact nutrient field names (and values) a provider reported for the
 * imported food, so users can add them as custom-nutrient aliases in one click.
 * Fields already captured by a standard column or an existing custom nutrient
 * are flagged so users don't create redundant ones. Only renders for provider
 * imports that carry provider_nutrients.
 */
export const ProviderNutrientViewer = ({
  food,
  onApplyMatch,
}: ProviderNutrientViewerProps) => {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogLabel, setDialogLabel] = useState('');
  const [dialogUnit, setDialogUnit] = useState('');
  const { toast } = useToast();
  const { data: customNutrients } = useCustomNutrients();
  const { mutateAsync: updateCustomNutrient } =
    useUpdateCustomNutrientMutation();

  const { providerNutrients, providerUnits } = useMemo(() => {
    const variant =
      food?.default_variant ??
      food?.variants?.find((v) => v.is_default) ??
      food?.variants?.[0];
    const entries = Object.entries(variant?.provider_nutrients ?? {});
    // Stable alphabetical order for scanning.
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    return {
      providerNutrients: entries,
      providerUnits: variant?.provider_nutrient_units ?? {},
    };
  }, [food]);

  // Map a normalized provider label -> the custom nutrient it already matches.
  const matchByNormalizedLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const nutrient of customNutrients ?? []) {
      for (const key of [nutrient.name, ...(nutrient.aliases ?? [])]) {
        const normalized = normalizeNutrientName(key);
        if (normalized && !map.has(normalized))
          map.set(normalized, nutrient.name);
      }
    }
    return map;
  }, [customNutrients]);

  if (!food || providerNutrients.length === 0) return null;

  const providerLabel = (food.provider_type ?? 'provider').toUpperCase();
  const sourceUrl = getProviderFoodUrl(food);

  const addAliasToNutrient = async (
    nutrient: NonNullable<typeof customNutrients>[number],
    label: string
  ) => {
    const aliases = nutrient.aliases ?? [];
    if (
      aliases.some((a) => a.toLowerCase() === label.toLowerCase()) ||
      nutrient.name.toLowerCase() === label.toLowerCase()
    ) {
      toast({
        title: 'Already mapped',
        description: `"${label}" already maps to ${nutrient.name}.`,
      });
      return;
    }
    try {
      await updateCustomNutrient({
        nutrientId: nutrient.id,
        name: nutrient.name,
        unit: nutrient.unit,
        aliases: [...aliases, label],
      });
      onApplyMatch?.(nutrient.name, label, nutrient.unit);
      toast({
        title: 'Alias added',
        description: `"${label}" will now import into ${nutrient.name}.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to add alias. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const openCreateDialog = (label: string) => {
    setDialogLabel(label);
    setDialogUnit(providerUnits[label] ?? '');
    setDialogOpen(true);
  };

  return (
    <>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className="border rounded-md"
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-medium">
              Nutrient fields reported by {providerLabel} (
              {providerNutrients.length})
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            These are the exact field names {providerLabel} uses. Add one as an
            alias so it imports into your custom nutrient. Matching ignores case
            and punctuation.
          </p>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View this food on {providerLabel}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <div className="divide-y">
            {providerNutrients.map(([label, value]) => {
              const matchedNutrient = matchByNormalizedLabel.get(
                normalizeNutrientName(label)
              );
              const standardId = matchedNutrient
                ? null
                : getStandardNutrientId(label);
              const standardLabel = standardId
                ? (CENTRAL_NUTRIENT_CONFIG[standardId]?.defaultLabel ??
                  standardId)
                : null;
              return (
                <div
                  key={label}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-mono break-all">{label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {value}
                      {providerUnits[label] ? ` ${providerUnits[label]}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {matchedNutrient ? (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="h-3 w-3" />
                        {matchedNutrient}
                      </Badge>
                    ) : standardLabel ? (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        Standard: {standardLabel}
                      </Badge>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7">
                            <Plus className="h-3 w-3 mr-1" />
                            Add as alias
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>
                            Add "{label}" to
                          </DropdownMenuLabel>
                          {(customNutrients ?? []).map((nutrient) => (
                            <DropdownMenuItem
                              key={nutrient.id}
                              onClick={() =>
                                addAliasToNutrient(nutrient, label)
                              }
                            >
                              {nutrient.name}
                            </DropdownMenuItem>
                          ))}
                          {(customNutrients ?? []).length > 0 && (
                            <DropdownMenuSeparator />
                          )}
                          <DropdownMenuItem
                            onClick={() => openCreateDialog(label)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            New custom nutrient
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
      <CustomNutrientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialName={dialogLabel}
        initialUnit={dialogUnit}
        initialAliases={dialogLabel ? [dialogLabel] : []}
        onCreated={(name, unit) => {
          if (dialogLabel) onApplyMatch?.(name, dialogLabel, unit);
        }}
      />
    </>
  );
};

export default ProviderNutrientViewer;
