import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListPlus, Plus, Search } from 'lucide-react';
import {
  MACRO_PICKER_FIELDS,
  MICRONUTRIENT_CATALOG,
  MULTIVITAMIN_PANEL_IDS,
  normalizeNutrientName,
} from '@workspace/shared';
import {
  collectClaimedNutrientNames,
  isNutrientOptionAlreadyAdded,
  type NutrientPick,
} from './medicationUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { UserCustomNutrient } from '@/types/customNutrient';

type OptionGroup = 'catalog' | 'custom';

interface NutrientOption {
  /** identifies the option within the picker */
  id: string;
  label: string;
  unit: string;
  group: OptionGroup;
  /** the key to store against, for options that don't need seeding first */
  fieldKey?: string;
  /** the canonical catalog id, for options that must be seeded before use */
  catalogId?: string;
  /** catalog ids this option expands into (a compound like Omega-3 -> EPA + DHA) */
  components?: string[];
  /** label spellings this option should also match on (catalog aliases) */
  aliases?: string[];
}

const GROUP_LABELS: Record<OptionGroup, [string, string]> = {
  catalog: ['medications.cabinet.nutrientGroupCatalog', 'Vitamins & minerals'],
  custom: ['medications.cabinet.nutrientGroupCustom', 'Your custom nutrients'],
};

/**
 * Adds nutrient rows to a supplement's "nutrition per dose" editor.
 *
 * Starts empty and is additive: the user searches the canonical catalog and picks the
 * nutrients that are actually on their label, rather than being handed the 17 fixed food
 * macros (which contain no vitamin D, K, magnesium, zinc or B12 — i.e. none of what a
 * typical supplement supplies). A single-nutrient supplement gets one row; a multivitamin
 * gets its ~20 via the bulk panel button.
 *
 * Picks are PENDING: nothing is created server-side here. The dialog find-or-creates the
 * catalog and free-text nutrients only when the supplement is saved, seeding each with the
 * catalog's canonical name, unit, aliases and Daily Value at that point.
 */
export function NutrientPicker({
  selected,
  customNutrients,
  onAdd,
}: {
  selected: string[];
  customNutrients?: UserCustomNutrient[];
  onAdd: (picks: NutrientPick[]) => void;
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('mg');

  const options = useMemo<NutrientOption[]>(() => {
    // Component nutrients (EPA/DHA under Omega-3) are only offered as the expansion of
    // their compound parent, so they never appear as standalone list rows.
    const componentIds = new Set(
      MICRONUTRIENT_CATALOG.flatMap((entry) => entry.components ?? [])
    );
    const catalogOptions: NutrientOption[] = MICRONUTRIENT_CATALOG.filter(
      (entry) => !componentIds.has(entry.id)
    ).map((entry) => ({
      id: `catalog:${entry.id}`,
      label: entry.displayName,
      unit: entry.unit,
      group: 'catalog',
      catalogId: entry.id,
      fieldKey: entry.fixedField,
      components: entry.components,
      aliases: entry.aliases,
    }));

    // The user's own free-text nutrients, minus anything the catalog or the macro group
    // already offers under the same normalized name (otherwise "Vitamin D" would appear
    // twice). A custom nutrient named "Protein" is not supposed to exist, since seeding
    // refuses to shadow a fixed food-variant column, but one entered by hand in Settings
    // would otherwise sit next to the real Protein row and be counted separately.
    const catalogNames = new Set([
      ...MICRONUTRIENT_CATALOG.flatMap((entry) =>
        [entry.displayName, ...entry.aliases].map(normalizeNutrientName)
      ),
      // shortLabel is listed for completeness rather than to close a live gap: today every
      // macro's shortLabel already normalizes onto its own displayName or one of its
      // aliases ("Carbs" onto the carbs alias, "Fiber" onto the fiber one). Listing it
      // keeps this set aligned with resolveMacroFieldKey, which matches on the same four,
      // so a macro added later with a distinct shortLabel cannot slip through and be
      // counted separately as a custom nutrient.
      ...MACRO_PICKER_FIELDS.flatMap((field) =>
        [
          field.displayName,
          field.shortLabel,
          field.fieldKey,
          ...field.aliases,
        ].map(normalizeNutrientName)
      ),
    ]);
    const customOptions: NutrientOption[] = (customNutrients ?? [])
      .filter(
        (nutrient) => !catalogNames.has(normalizeNutrientName(nutrient.name))
      )
      .map((nutrient) => ({
        id: `custom:${nutrient.name}`,
        label: nutrient.name,
        unit: nutrient.unit,
        group: 'custom',
        fieldKey: nutrient.name,
      }));

    // Alphabetical within each group — easier to scan than the catalog's authoring order.
    // Numeric collation so "Vitamin B6" sorts before "Vitamin B12", not after.
    const byLabel = (a: NutrientOption, b: NutrientOption) =>
      a.label.localeCompare(b.label, undefined, { numeric: true });
    // Macros keep their authoring order (calories, protein, carbs, fat, fiber), which is
    // the order a Nutrition Facts panel prints them and therefore the order they are read.
    return [...catalogOptions.sort(byLabel), ...customOptions.sort(byLabel)];
  }, [customNutrients]);

  const claimedNames = useMemo(
    () => collectClaimedNutrientNames(selected, customNutrients),
    [selected, customNutrients]
  );

  const isAlreadyAdded = (option: NutrientOption): boolean => {
    // A compound counts as added once every component it expands into is present, so it
    // drops out of the list after you add it rather than lingering as a re-clickable row.
    if (option.components && option.components.length > 0) {
      return option.components.every((componentId) => {
        const entry = MICRONUTRIENT_CATALOG.find((e) => e.id === componentId);
        if (!entry) return false;
        const key = entry.fixedField ?? entry.displayName;
        return (
          selected.includes(key) ||
          claimedNames.has(normalizeNutrientName(entry.displayName)) ||
          // Also treat a component as present if the user already holds it under one of its
          // aliases (e.g. a bare "EPA"), so the compound doesn't re-add a duplicate row.
          entry.aliases.some((alias) =>
            claimedNames.has(normalizeNutrientName(alias))
          )
        );
      });
    }
    return isNutrientOptionAlreadyAdded(option, selected, claimedNames);
  };

  const visible = useMemo(() => {
    const query = normalizeNutrientName(search);
    return options.filter((option) => {
      if (isAlreadyAdded(option)) return false;
      if (!query) return true;
      // Match label OR any catalog alias, so searching a label spelling like "Vitamin D3"
      // or "Cholecalciferol" surfaces the canonical "Vitamin D" entry instead of nothing.
      if (normalizeNutrientName(option.label).includes(query)) return true;
      return (option.aliases ?? []).some((alias) =>
        normalizeNutrientName(alias).includes(query)
      );
    });
    // isAlreadyAdded is derived from options + claimedNames, both of which are deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, search, claimedNames]);

  const grouped = useMemo(() => {
    const groups: Record<OptionGroup, NutrientOption[]> = {
      catalog: [],
      custom: [],
    };
    for (const option of visible) groups[option.group].push(option);
    return groups;
  }, [visible]);

  const reset = () => {
    setSearch('');
    setNewName('');
    setNewUnit('mg');
  };

  const pickFor = (
    key: string,
    unit: string,
    catalogId?: string
  ): NutrientPick => (catalogId ? { key, unit, catalogId } : { key, unit });

  // Resolve a catalog nutrient against the user's EXISTING custom nutrients (by canonical
  // name or alias). If one matches, reuse that row and — crucially — its unit, so the amount
  // is entered against the unit it will actually be stored in. Otherwise it's a fresh catalog
  // pick carrying the catalog unit. Without this a pre-existing "Vitamin D" in IU would
  // silently receive a value the picker prompted for in µg. Mirrors the server-side
  // alias resolution so the client shows the right unit up front.
  const resolveCatalogPick = (
    name: string,
    aliases: string[] | undefined,
    unit: string,
    catalogId?: string
  ): NutrientPick => {
    const keys = new Set([name, ...(aliases ?? [])].map(normalizeNutrientName));
    const existing = (customNutrients ?? []).find((nutrient) =>
      [nutrient.name, ...(nutrient.aliases ?? [])].some((candidate) =>
        keys.has(normalizeNutrientName(candidate))
      )
    );
    return existing
      ? { key: existing.name, unit: existing.unit }
      : { key: name, unit, catalogId };
  };

  // Picking creates NOTHING server-side. The rows are held as pending picks and the
  // dialog find-or-creates them only when the supplement is saved, so cancelling out
  // (or mis-clicking the panel) leaves no custom nutrients behind.
  const buildPicks = (opts: NutrientOption[]): NutrientPick[] =>
    opts.flatMap((option) => {
      // A compound (e.g. Omega-3) has no amount of its own — it expands into individual
      // rows for each component nutrient, which the user then fills in separately.
      if (option.components && option.components.length > 0) {
        return option.components.flatMap((componentId) => {
          const entry = MICRONUTRIENT_CATALOG.find((e) => e.id === componentId);
          if (!entry) return [];
          return [
            entry.fixedField
              ? pickFor(entry.fixedField, entry.unit)
              : resolveCatalogPick(
                  entry.displayName,
                  entry.aliases,
                  entry.unit,
                  entry.id
                ),
          ];
        });
      }
      // A fixed food-variant column, or a custom nutrient the user already has → store as-is.
      if (option.fieldKey) return [pickFor(option.fieldKey, option.unit)];
      return [
        resolveCatalogPick(
          option.label,
          option.aliases,
          option.unit,
          option.catalogId
        ),
      ];
    });

  // Click-to-add: a row adds immediately and the popover CLOSES, so the newly added
  // field(s) in the nutrition section are visible rather than hidden behind the still-open
  // popover. A compound (Omega-3) adds all its components in the one click before closing.
  const addOptions = (opts: NutrientOption[]) => {
    const picks = buildPicks(opts);
    if (picks.length === 0) return;
    onAdd(picks);
    reset();
    setOpen(false);
  };

  const addMultivitaminPanel = () => {
    const ids = new Set(
      MULTIVITAMIN_PANEL_IDS.map((catalogId) => `catalog:${catalogId}`)
    );
    // Don't re-add rows the editor already has.
    addOptions(
      options.filter((option) => ids.has(option.id) && !isAlreadyAdded(option))
    );
  };

  // The dialog this picker lives in. Used both to portal the popover inside it (so the
  // dialog's scroll lock permits interaction) AND as the collision boundary, so Radix caps
  // the popover height and flips against the dialog's visible box rather than the viewport
  // — without it, a popover opening upward from low in the dialog overflows past the
  // dialog's scrolled top and its search box is clipped out of reach.
  const dialogNode =
    rootRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null;

  const trimmedNewName = newName.trim();
  const newNameCollides =
    trimmedNewName.length > 0 &&
    (() => {
      const q = normalizeNutrientName(trimmedNewName);
      // Collide on a label OR a catalog alias, so a free-text "Cholecalciferol" is caught
      // as an existing nutrient rather than seeded as a divergent duplicate of Vitamin D.
      return options.some(
        (option) =>
          normalizeNutrientName(option.label) === q ||
          (option.aliases ?? []).some(
            (alias) => normalizeNutrientName(alias) === q
          )
      );
    })();

  const createFreeText = () => {
    if (!trimmedNewName || newNameCollides) return;
    // Also deferred to save — see commit().
    onAdd([{ key: trimmedNewName, unit: newUnit.trim() || 'mg', isNew: true }]);
    reset();
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="flex flex-wrap gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            {t('medications.cabinet.addNutrient', 'Add nutrient')}
          </Button>
        </PopoverTrigger>
        {/*
          Portalled into the surrounding dialog rather than `document.body`: the dialog's
          scroll lock only exempts its own content node, so a body-portalled popover cannot
          be wheel-scrolled and dismisses as part of the wrong layer. See PopoverContent.

          The trigger also sits low in a long dialog, so the popover routinely opens upward.
          Cap it to the space Radix actually has (`--radix-popover-content-available-height`)
          and lay it out as a column, so the scrollable list absorbs the shortfall instead of
          the whole popover overflowing off the top of the viewport, where it can't be reached.
        */}
        <PopoverContent
          container={dialogNode}
          collisionBoundary={dialogNode ?? undefined}
          className="flex max-h-[var(--radix-popover-content-available-height)] w-80 flex-col overflow-hidden p-0"
          align="start"
          collisionPadding={16}
        >
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(
                'medications.cabinet.searchNutrients',
                'Search nutrients…'
              )}
              className="h-8 border-0 p-0 shadow-none focus-visible:ring-0"
            />
          </div>

          {/* Native overflow scroll (NOT Radix ScrollArea): the dialog's react-remove-scroll
              lock only permits scrolling inside its own subtree, and Radix ScrollArea's JS
              wheel handling fights that lock, so the list wouldn't scroll. Only the nutrient
              list scrolls here; the search and the create-your-own row stay pinned.

              FIXED height rather than flex-auto. A list that shrinks as the query narrows
              shrinks the popover with it, and Radix then re-anchors the whole thing, so
              the panel jumped away under the cursor mid-keystroke. A constant height keeps
              filtering inside the scroll area where it belongs. It is capped by the
              popover's own max-height. It may still SHRINK below that when the viewport
              is short: pinning it with shrink-0 pushed the create-your-own footer out of
              the clipped popover instead of letting the list give up the space. */}
          <div className="h-56 min-h-0 overflow-y-auto">
            <div className="p-1">
              {visible.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {t(
                    'medications.cabinet.noNutrientMatches',
                    'No matches. Create it below.'
                  )}
                </p>
              )}
              {(Object.keys(grouped) as OptionGroup[]).map((group) => {
                const groupOptions = grouped[group];
                if (groupOptions.length === 0) return null;
                const [labelKey, labelDefault] = GROUP_LABELS[group];
                return (
                  <div key={group} className="mb-1">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(labelKey, labelDefault)}
                    </p>
                    {groupOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => addOptions([option])}
                        className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1">{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.unit}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Compact single-row create control: keeps the pinned footer short so the
              scrollable list keeps most of the popover's height. */}
          <div className="shrink-0 space-y-1 border-t p-2">
            <Label className="text-[11px] text-muted-foreground">
              {t(
                'medications.cabinet.createNutrient',
                'Not listed? Create your own'
              )}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t(
                  'medications.cabinet.nutrientNamePlaceholder',
                  'e.g. Ashwagandha'
                )}
                className="h-8 flex-1"
              />
              <Input
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                className="h-8 w-14"
                aria-label={t('medications.cabinet.nutrientUnit', 'Unit')}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={!trimmedNewName || newNameCollides}
                onClick={createFreeText}
              >
                {t('medications.cabinet.createAndAddShort', 'Add')}
              </Button>
            </div>
            {newNameCollides && (
              <p className="text-xs text-destructive">
                {t(
                  'medications.cabinet.nutrientExists',
                  'That nutrient already exists — pick it from the list.'
                )}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={addMultivitaminPanel}
      >
        <ListPlus className="mr-2 h-4 w-4" />
        {t('medications.cabinet.multivitaminPanel', 'Multivitamin panel')}
      </Button>
    </div>
  );
}
