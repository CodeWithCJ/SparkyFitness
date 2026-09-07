import type React from 'react';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeContainerPress } from '@/utils/waterContainerLabels';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  useWaterContainersQuery,
  useCreateWaterContainerMutation,
  useUpdateWaterContainerMutation,
  useDeleteWaterContainerMutation,
  useSetPrimaryWaterContainerMutation,
  useDrinkPresetCatalogQuery,
  useMaterializeDrinkPresetMutation,
} from '@/hooks/Settings/useWaterContainers';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import { foodViewOptions } from '@/hooks/Foods/useFoods';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import FoodSearchDialog from '@/components/FoodSearch/FoodSearchDialog';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import {
  linkedHydrationExample,
  plainHydrationExample,
} from '@workspace/shared';
import type { Food, FoodVariant } from '@/types/food';
import type { Meal } from '@/types/meal';
import type { WaterContainer } from '@/types/settings';
import type { DrinkPresetCatalogEntry } from '@workspace/shared';
import { Utensils, X, Edit2, Link2, Plus, Coffee, Beer } from 'lucide-react';

const WaterContainerManager: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();

  // Add container form state. The two kinds of container are measured
  // differently -- one by its volume, one by the food it holds -- so the form
  // asks for one set of fields or the other, never both at once.
  const [addMode, setAddMode] = useState<'water' | 'food'>('water');
  const [name, setName] = useState('');
  const [volume, setVolume] = useState<number | ''>('');
  const [unit, setUnit] = useState<'ml' | 'oz' | 'liter'>('ml');
  const [servingsPerContainer, setServingsPerContainer] = useState<number | ''>(
    ''
  );
  const [hydrationFactor, setHydrationFactor] = useState<number>(1.0);
  const [linkedFood, setLinkedFood] = useState<Food | null>(null);
  const [foodVariants, setFoodVariants] = useState<FoodVariant[]>([]);
  const [linkedVariantId, setLinkedVariantId] = useState<string | null>(null);
  const [linkedMealTypeId, setLinkedMealTypeId] = useState<string | null>(null);
  const [linkedQuantity, setLinkedQuantity] = useState<number | ''>(1);

  // Edit container dialog state
  const [editingContainer, setEditingContainer] =
    useState<WaterContainer | null>(null);
  const [editName, setEditName] = useState('');
  const [editVolume, setEditVolume] = useState<number | ''>('');
  const [editUnit, setEditUnit] = useState<'ml' | 'oz' | 'liter'>('ml');
  const [editServings, setEditServings] = useState<number | ''>('');
  const [editHydrationFactor, setEditHydrationFactor] = useState<number>(1.0);
  const [editLinkedFood, setEditLinkedFood] = useState<Food | null>(null);
  const [editFoodVariants, setEditFoodVariants] = useState<FoodVariant[]>([]);
  const [editLinkedVariantId, setEditLinkedVariantId] = useState<string | null>(
    null
  );
  const [editLinkedMealTypeId, setEditLinkedMealTypeId] = useState<
    string | null
  >(null);
  const [editLinkedQuantity, setEditLinkedQuantity] = useState<number | ''>(1);

  // Catalog dialog state
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const [catalogKindFilter, setCatalogKindFilter] = useState<
    'all' | 'caffeine' | 'alcohol'
  >('all');

  // Food search dialog state
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<'add' | 'edit'>('add');
  // The quantity and unit are asked for with the diary's own picker, so a
  // container is set up the same way the food would be logged -- including the
  // converted units that only that picker offers.
  const [unitSelectorFood, setUnitSelectorFood] = useState<Food | null>(null);

  const queryClient = useQueryClient();
  const { data: containers = [] } = useWaterContainersQuery(user?.activeUserId);
  const { data: catalog = [] } = useDrinkPresetCatalogQuery();
  const { data: availableMealTypes = [] } = useMealTypes();
  const { mutateAsync: createWaterContainer } =
    useCreateWaterContainerMutation();
  const { mutateAsync: updateWaterContainer } =
    useUpdateWaterContainerMutation();
  const { mutateAsync: deleteWaterContainer } =
    useDeleteWaterContainerMutation();
  const { mutateAsync: setPrimaryWaterContainer } =
    useSetPrimaryWaterContainerMutation();
  const { mutateAsync: materializeDrinkPreset, isPending: addingPreset } =
    useMaterializeDrinkPresetMutation();

  const standardContainers = useMemo(
    () => containers.filter((c) => !c.is_quick_add),
    [containers]
  );

  const quickAddPresets = useMemo(
    () => containers.filter((c) => !!c.is_quick_add),
    [containers]
  );

  const filteredCatalog = useMemo(() => {
    if (catalogKindFilter === 'all') return catalog;
    return catalog.filter((entry) => entry.kind === catalogKindFilter);
  }, [catalog, catalogKindFilter]);

  const handleOpenFoodSearch = (target: 'add' | 'edit') => {
    setSearchTarget(target);
    setSearchDialogOpen(true);
  };

  const handleFoodSelect = async (item: Food | Meal, type: 'food' | 'meal') => {
    if (type !== 'food' || !item.id) return;
    setSearchDialogOpen(false);
    try {
      const fullFood = await queryClient.fetchQuery(foodViewOptions(item.id));
      setUnitSelectorFood(fullFood ?? (item as Food));
    } catch {
      // Fallback to the basic selected item if full details fail; the picker
      // loads the variants itself.
      setUnitSelectorFood(item as Food);
    }
  };

  // What one press logs, in the picked variant's own unit -- the same pairing
  // the diary shows when you add this food.
  const describeLink = (
    variants: FoodVariant[],
    variantId: string | null,
    quantity: number | ''
  ) => {
    const variant = variants.find((v) => v.id === variantId);
    return `${quantity === '' ? '' : quantity} ${variant?.serving_unit ?? ''}`.trim();
  };

  // Only a "Change quantity/unit" reopen carries values in; a freshly picked
  // food must let the picker default to its own serving size, the way the
  // diary does, rather than inheriting a leftover 1.
  const unitSelectorTarget =
    searchTarget === 'add' ? linkedFood : editLinkedFood;
  const isReopeningLink =
    !!unitSelectorFood && unitSelectorFood.id === unitSelectorTarget?.id;

  // "0.9" says nothing about what a press will do, so show the numbers for the
  // container in front of the user and fall back to the generic examples only
  // when there is nothing to compute from yet.
  const renderHydrationHelp = (
    factor: number,
    variants: FoodVariant[],
    variantId: string | null,
    quantity: number | '',
    linked: boolean,
    containerVolume: number | '',
    containerServings: number | '',
    containerUnit: string
  ) => {
    const variant = variants.find((v) => v.id === variantId);
    const example = linked
      ? linkedHydrationExample(factor, {
          waterMl: variant?.water_ml,
          servingSize: variant?.serving_size,
          quantity,
        })
      : plainHydrationExample(factor, {
          volume: containerVolume,
          servings: containerServings,
          unit: containerUnit,
        });

    return (
      <p className="text-[11px] text-muted-foreground">
        {example
          ? t('waterContainerManager.hydrationFactorExample', {
              defaultValue:
                'At {{factor}}, one press adds {{credited}} {{unit}} to your water ring out of the drink’s {{total}} {{unit}}. Calories, caffeine and alcohol always count in full.',
              factor,
              credited: example.credited,
              total: example.total,
              unit: example.unit,
            })
          : t('waterContainerManager.hydrationFactorHelp', {
              defaultValue:
                'Scales the water credit only: 1 for water, about 0.9 for coffee or tea, 0 for a drink that should count as no water at all. Calories, caffeine and alcohol always count in full.',
            })}
      </p>
    );
  };

  const handleUnitSelected = (
    food: Food,
    quantity: number,
    _unit: string,
    variant: FoodVariant
  ) => {
    // A converted unit is created on the fly, so it will not be in the cached
    // food yet -- merge it in or the summary loses its unit.
    const known = food.variants ?? [];
    const variants = known.some((v) => v.id === variant.id)
      ? known
      : [...known, variant];
    if (searchTarget === 'add') {
      setLinkedFood(food);
      setFoodVariants(variants);
      setLinkedVariantId(variant.id ?? null);
      setLinkedQuantity(quantity);
    } else {
      setEditLinkedFood(food);
      setEditFoodVariants(variants);
      setEditLinkedVariantId(variant.id ?? null);
      setEditLinkedQuantity(quantity);
    }
    setUnitSelectorFood(null);
  };

  const handleAddContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    // A linked container measures the drink by how much of the food it holds,
    // so volume and servings are optional there; unlinked still needs both.
    if (!name) return;
    if (addMode === 'food' && !linkedFood) {
      toast({
        title: t('waterContainerManager.linkFoodRequired', 'Link a food first'),
        description: t(
          'waterContainerManager.linkFoodRequiredHint',
          'A drink container logs a food, so pick the one this container holds.'
        ),
        variant: 'destructive',
      });
      return;
    }
    if (!linkedFood && (volume === '' || servingsPerContainer === '')) return;
    if (linkedFood && linkedQuantity === '') return;
    await createWaterContainer({
      name,
      // 0 on a linked container means "no override": take the volume from the
      // linked food rather than repeating it here.
      volume: linkedFood ? Number(volume || 0) : Number(volume),
      unit,
      is_primary: false,
      servings_per_container: linkedFood ? 1 : Number(servingsPerContainer),
      linked_quantity: linkedFood ? Number(linkedQuantity) : 1,
      hydration_factor: Number(hydrationFactor) || 1.0,
      linked_food_id: linkedFood ? linkedFood.id : null,
      linked_variant_id: linkedVariantId,
      linked_meal_type_id: linkedMealTypeId,
      is_quick_add: false,
    });
    setName('');
    setVolume('');
    setServingsPerContainer('');
    setHydrationFactor(1.0);
    setLinkedFood(null);
    setFoodVariants([]);
    setLinkedVariantId(null);
    setLinkedMealTypeId(null);
    setLinkedQuantity(1);
  };

  const handleAddModeChange = (value: string) => {
    const mode = value === 'food' ? 'food' : 'water';
    setAddMode(mode);
    if (mode === 'water') {
      // Leaving the drink tab drops the link, so a container cannot keep a
      // food that the visible form no longer shows.
      setLinkedFood(null);
      setFoodVariants([]);
      setLinkedVariantId(null);
      setLinkedMealTypeId(null);
      setLinkedQuantity(1);
    } else {
      // Volume and servings belong to the water tab; a linked container takes
      // both from the food, and 0 is the server's "no override" sentinel.
      setVolume('');
      setServingsPerContainer('');
    }
  };

  const handleStartEdit = async (container: WaterContainer) => {
    setEditingContainer(container);
    setEditName(container.name);
    setEditVolume(container.volume);
    setEditUnit(container.unit);
    setEditServings(container.servings_per_container);
    setEditHydrationFactor(container.hydration_factor ?? 1.0);
    setEditLinkedMealTypeId(container.linked_meal_type_id || null);
    setEditLinkedQuantity(container.linked_quantity ?? 1);

    if (container.linked_food_id) {
      try {
        const fullFood = await queryClient.fetchQuery(
          foodViewOptions(container.linked_food_id)
        );
        setEditLinkedFood(fullFood ?? null);
        setEditFoodVariants(fullFood?.variants || []);
        setEditLinkedVariantId(container.linked_variant_id || null);
      } catch {
        setEditLinkedFood({
          id: container.linked_food_id,
          name: container.linked_food_name || 'Linked Food',
          is_custom: false,
        } as Food);
        setEditFoodVariants([]);
        setEditLinkedVariantId(container.linked_variant_id || null);
      }
    } else {
      setEditLinkedFood(null);
      setEditFoodVariants([]);
      setEditLinkedVariantId(null);
    }
  };

  const handleSaveEdit = async () => {
    // Same rule as the add form: a linked container is measured by how much of
    // the food it holds, so volume and servings are optional there.
    if (!editingContainer || !editName) return;
    if (!editLinkedFood && (editVolume === '' || editServings === '')) return;
    if (editLinkedFood && editLinkedQuantity === '') return;
    await updateWaterContainer({
      id: editingContainer.id,
      containerData: {
        name: editName,
        // 0 when linked = "no override", so the food's own volume is used.
        // 0 is the server's "no override": a linked container measures the
        // drink by the food it holds, so it never carries its own volume.
        volume: editLinkedFood ? 0 : Number(editVolume),
        unit: editUnit,
        servings_per_container: editLinkedFood ? 1 : Number(editServings),
        linked_quantity: editLinkedFood ? Number(editLinkedQuantity) : 1,
        hydration_factor: Number(editHydrationFactor) || 1.0,
        linked_food_id: editLinkedFood ? editLinkedFood.id : null,
        linked_variant_id: editLinkedVariantId ?? null,
        linked_meal_type_id: editLinkedMealTypeId ?? null,
      },
    });
    toast({
      title: t('foodDiary.success', 'Success'),
      description: t(
        'waterContainerManager.updated',
        'Water container updated.'
      ),
    });
    setEditingContainer(null);
  };

  const handleDeleteContainer = async (id: number) => {
    await deleteWaterContainer(id);
    toast({
      title: t('foodDiary.success', 'Success'),
      description: t(
        'waterContainerManager.deleted',
        'Water container deleted.'
      ),
    });
  };

  const handleSetPrimary = async (id: number) => {
    await setPrimaryWaterContainer(id);
    toast({
      title: t('foodDiary.success', 'Success'),
      description: t(
        'waterContainerManager.primaryUpdated',
        'Primary container updated.'
      ),
    });
  };

  const handleAddPresetFromCatalog = async (entry: DrinkPresetCatalogEntry) => {
    try {
      await materializeDrinkPreset(entry.id);
      toast({
        title: t('foodDiary.success', 'Success'),
        description: t(
          'drink_presets.presetAdded',
          'Preset added successfully.'
        ),
      });
      setCatalogDialogOpen(false);
    } catch {
      toast({
        title: t('foodDiary.error', 'Error'),
        description: t(
          'drink_presets.addFailed',
          'Failed to add drink preset.'
        ),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Quick-Add Drink Presets Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>
              {t('drink_presets.title', 'Quick-Add Drink Presets')}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                'drink_presets.description',
                'One-tap presets for common caffeinated and alcoholic beverages'
              )}
            </p>
          </div>
          <Button
            onClick={() => setCatalogDialogOpen(true)}
            className="flex items-center gap-1.5"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            {t('drink_presets.addFromCatalog', 'Add from Catalog')}
          </Button>
        </CardHeader>
        <CardContent>
          {quickAddPresets.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">
              <p>
                {t(
                  'drink_presets.noPresets',
                  'No quick-add drink presets yet. Add espresso, coffee, tea, or beer from the catalog.'
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCatalogDialogOpen(true)}
                className="mt-3"
              >
                {t('drink_presets.addFromCatalog', 'Add from Catalog')}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {quickAddPresets.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-md gap-3 bg-card"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">
                        {c.name}
                        {describeContainerPress(c)
                          ? ` - ${describeContainerPress(c)}`
                          : ''}
                      </p>
                      <Badge
                        variant="secondary"
                        className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300"
                      >
                        {t('drink_presets.quickAdd', 'Quick-Add')}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {c.linked_food_id && (
                        <Badge
                          variant="outline"
                          className="flex items-center gap-1 font-normal text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                        >
                          <Utensils className="w-3 h-3" />
                          <span>
                            {t(
                              'waterContainerManager.linkedFood',
                              'Linked Food'
                            )}
                            : {c.linked_food_name || 'Food'}
                          </span>
                        </Badge>
                      )}
                      {c.hydration_factor !== undefined && (
                        <Badge variant="outline" className="font-normal">
                          {t(
                            'waterContainerManager.hydrationFactor',
                            'Hydration'
                          )}
                          : {Math.round((c.hydration_factor ?? 1) * 100)}%
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartEdit(c)}
                      className="flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      {t('waterContainerManager.edit', 'Edit')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteContainer(c.id)}
                    >
                      {t('common.delete', 'Delete')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Regular Water Containers Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('waterContainerManager.title', 'Manage Water Containers')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            onSubmit={handleAddContainer}
            className="space-y-4 border p-4 rounded-lg bg-gray-50/50 dark:bg-slate-900/40"
          >
            <Tabs value={addMode} onValueChange={handleAddModeChange}>
              <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
                <TabsTrigger value="water">
                  {t('waterContainerManager.tabWater', 'Water')}
                </TabsTrigger>
                <TabsTrigger value="food">
                  {t('waterContainerManager.tabDrink', 'Drink (linked food)')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-sm text-muted-foreground">
              {addMode === 'food'
                ? t(
                    'waterContainerManager.modeLinked',
                    'One press logs the food below into your diary and credits its water.'
                  )
                : t(
                    'waterContainerManager.modePlain',
                    'One press credits this volume of plain water.'
                  )}
            </p>
            <div
              className={
                addMode === 'food'
                  ? 'grid grid-cols-1 gap-3'
                  : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3'
              }
            >
              <div className="grid gap-1.5">
                <Label htmlFor="name">
                  {t('waterContainerManager.name', 'Container Name')}
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t(
                    'waterContainerManager.namePlaceholder',
                    'e.g., My Water Bottle'
                  )}
                  required
                />
              </div>
              {addMode === 'water' && (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="volume">
                      {t('waterContainerManager.volume', 'Volume')}
                    </Label>
                    <Input
                      id="volume"
                      type="number"
                      min="0.001"
                      step="any"
                      value={volume}
                      onChange={(e) =>
                        setVolume(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      placeholder={t(
                        'waterContainerManager.volumePlaceholder',
                        'e.g., 500'
                      )}
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="unit">
                      {t('waterContainerManager.unit', 'Unit')}
                    </Label>
                    <Select
                      value={unit}
                      onValueChange={(value: 'ml' | 'oz' | 'liter') =>
                        setUnit(value)
                      }
                    >
                      <SelectTrigger id="unit">
                        <SelectValue
                          placeholder={t('waterContainerManager.unit', 'Unit')}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ml">ml</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="liter">
                          {t('waterContainerManager.liter', 'liter')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {/* Quantity lives beside the variant inside the linked-food
                  card, the way the diary pairs Quantity with Unit. Servings
                  only means anything for a plain container. */}
              {addMode === 'water' && (
                <div className="grid gap-1.5">
                  <Label htmlFor="servingsPerContainer">
                    {t(
                      'waterContainerManager.servings',
                      'Servings per Container'
                    )}
                  </Label>
                  <Input
                    id="servingsPerContainer"
                    type="number"
                    min="1"
                    value={servingsPerContainer}
                    onChange={(e) =>
                      setServingsPerContainer(
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    placeholder={t(
                      'waterContainerManager.servingsPlaceholder',
                      'e.g., 4'
                    )}
                    required
                  />
                </div>
              )}
            </div>

            {/* Hydration Factor & Optional Food Link Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-slate-800">
              <div className="grid gap-1.5">
                <Label htmlFor="hydrationFactor">
                  {t(
                    'waterContainerManager.hydrationFactor',
                    'Hydration Factor'
                  )}
                </Label>
                <Input
                  id="hydrationFactor"
                  type="number"
                  min="0"
                  max="2"
                  step="0.05"
                  value={hydrationFactor}
                  onChange={(e) => setHydrationFactor(Number(e.target.value))}
                />
                {renderHydrationHelp(
                  hydrationFactor,
                  foodVariants,
                  linkedVariantId,
                  linkedQuantity,
                  addMode === 'food',
                  volume,
                  servingsPerContainer,
                  unit
                )}
              </div>

              {addMode === 'food' && (
                <div className="grid gap-1.5">
                  <Label>
                    {t('waterContainerManager.linkedFood', 'Linked Food')}
                  </Label>
                  {linkedFood ? (
                    <div className="flex flex-col gap-2 p-2 border rounded-md bg-white dark:bg-slate-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <Utensils className="w-4 h-4 text-blue-500" />
                          <span>{linkedFood.name}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setLinkedFood(null);
                            setFoodVariants([]);
                            setLinkedVariantId(null);
                            setLinkedMealTypeId(null);
                          }}
                          className="h-6 px-2 text-xs text-red-500 hover:text-red-700"
                        >
                          <X className="w-3 h-3 mr-1" />
                          {t('waterContainerManager.unlinkFood', 'Unlink')}
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {t(
                            'waterContainerManager.perPress',
                            'One press logs'
                          )}{' '}
                          <span className="font-medium text-foreground">
                            {describeLink(
                              foodVariants,
                              linkedVariantId,
                              linkedQuantity
                            )}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            setSearchTarget('add');
                            setUnitSelectorFood(linkedFood);
                          }}
                        >
                          {t(
                            'waterContainerManager.changeQuantity',
                            'Change quantity/unit'
                          )}
                        </Button>
                      </div>
                      {availableMealTypes.length > 0 && (
                        <div className="grid gap-1">
                          <Label className="text-xs">
                            {t(
                              'waterContainerManager.selectMealType',
                              'Meal Category'
                            )}
                          </Label>
                          <Select
                            value={linkedMealTypeId || 'none'}
                            onValueChange={(val) =>
                              setLinkedMealTypeId(val === 'none' ? null : val)
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue
                                placeholder={t(
                                  'waterContainerManager.selectMealTypePlaceholder',
                                  'Select meal category (optional)'
                                )}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                {t(
                                  'waterContainerManager.selectMealTypePlaceholder',
                                  'Select meal category (optional)'
                                )}
                              </SelectItem>
                              {availableMealTypes.map((mt) => (
                                <SelectItem key={mt.id} value={mt.id}>
                                  {mt.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleOpenFoodSearch('add')}
                      className="flex items-center justify-center gap-1.5 h-10 border-dashed"
                    >
                      <Link2 className="w-4 h-4" />
                      {t('waterContainerManager.linkFood', 'Link to Food Item')}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <Button type="submit">
              {t('waterContainerManager.add', 'Add Container')}
            </Button>
          </form>

          <div className="space-y-2">
            {standardContainers.map((c) => (
              <div
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-md gap-3 bg-card"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">
                      {c.name}
                      {describeContainerPress(c)
                        ? ` - ${describeContainerPress(c)}`
                        : ''}
                      {/* Servings only divide a plain container's volume; a
                          linked one is measured by its food instead. */}
                      {!c.linked_food_id && (
                        <>
                          {' ('}
                          {t('waterContainerManager.servingsCount', {
                            count: c.servings_per_container,
                            defaultValue_one: '{{count}} serving',
                            defaultValue_other: '{{count}} servings',
                          })}
                          {')'}
                        </>
                      )}
                    </p>
                    {c.is_primary && (
                      <Badge
                        variant="secondary"
                        className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-300"
                      >
                        {t('waterContainerManager.primary', 'Primary')}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {c.linked_food_id && (
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1 font-normal text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                      >
                        <Utensils className="w-3 h-3" />
                        <span>
                          {t('waterContainerManager.linkedFood', 'Linked Food')}
                          : {c.linked_food_name || 'Food'}
                          {c.linked_variant_serving_size
                            ? ` (${c.linked_variant_serving_size} ${c.linked_variant_serving_unit || ''})`
                            : ''}
                          {c.linked_meal_type_name
                            ? ` • ${c.linked_meal_type_name}`
                            : ''}
                        </span>
                      </Badge>
                    )}
                    {c.hydration_factor !== undefined &&
                      c.hydration_factor !== 1.0 && (
                        <Badge variant="outline" className="font-normal">
                          {t(
                            'waterContainerManager.hydrationFactor',
                            'Hydration Factor'
                          )}
                          : {c.hydration_factor}x
                        </Badge>
                      )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {!c.is_primary && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetPrimary(c.id)}
                    >
                      {t('waterContainerManager.setPrimary', 'Set as Primary')}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStartEdit(c)}
                    className="flex items-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    {t('waterContainerManager.edit', 'Edit')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteContainer(c.id)}
                  >
                    {t('common.delete', 'Delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Catalog Dialog */}
      <Dialog open={catalogDialogOpen} onOpenChange={setCatalogDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {t('drink_presets.catalogTitle', 'Drink Preset Catalog')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'drink_presets.catalogDescription',
                'Choose a preset to add to your quick-add drink buttons.'
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Filter Pills */}
          <div className="flex gap-2 pt-2 border-b pb-3">
            <Button
              size="sm"
              variant={catalogKindFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setCatalogKindFilter('all')}
              className="h-7 text-xs"
            >
              {t('drink_presets.all', 'All')}
            </Button>
            <Button
              size="sm"
              variant={catalogKindFilter === 'caffeine' ? 'default' : 'outline'}
              onClick={() => setCatalogKindFilter('caffeine')}
              className="h-7 text-xs flex items-center gap-1"
            >
              <Coffee className="w-3.5 h-3.5" />
              {t('drink_presets.caffeine', 'Caffeine')}
            </Button>
            <Button
              size="sm"
              variant={catalogKindFilter === 'alcohol' ? 'default' : 'outline'}
              onClick={() => setCatalogKindFilter('alcohol')}
              className="h-7 text-xs flex items-center gap-1"
            >
              <Beer className="w-3.5 h-3.5" />
              {t('drink_presets.alcohol', 'Alcohol')}
            </Button>
          </div>

          {/* Preset list */}
          <div className="overflow-y-auto space-y-2 py-2 flex-1 max-h-[50vh]">
            {filteredCatalog.map((item) => {
              const alreadyAdded = quickAddPresets.some(
                (p) => p.name.toLowerCase() === item.defaultName.toLowerCase()
              );

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 border rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium text-sm">
                      {t(item.displayNameKey, item.defaultName)}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{item.volumeMl} ml</span>
                      {item.caffeineMg !== undefined && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-normal"
                        >
                          {item.caffeineMg} mg caffeine
                        </Badge>
                      )}
                      {item.abvPercent !== undefined && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-normal"
                        >
                          {item.abvPercent}% ABV
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 font-normal"
                      >
                        {Math.round(item.hydrationFactor * 100)}% water
                      </Badge>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={alreadyAdded ? 'secondary' : 'default'}
                    disabled={alreadyAdded || addingPreset}
                    onClick={() => handleAddPresetFromCatalog(item)}
                    className="h-8 text-xs"
                  >
                    {alreadyAdded
                      ? t('drink_presets.alreadyAdded', 'Added')
                      : t('drink_presets.addPreset', 'Add Preset')}
                  </Button>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCatalogDialogOpen(false)}
            >
              {t('waterContainerManager.cancel', 'Cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Container Dialog */}
      <Dialog
        open={!!editingContainer}
        onOpenChange={(open) => !open && setEditingContainer(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t('waterContainerManager.editContainer', 'Edit Container')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5 col-span-2">
                <Label htmlFor="edit-name">
                  {t('waterContainerManager.name', 'Container Name')}
                </Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>
              {!editLinkedFood && (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-volume">
                      {t('waterContainerManager.volume', 'Volume')}
                    </Label>
                    <Input
                      id="edit-volume"
                      type="number"
                      min="0.001"
                      step="any"
                      value={editVolume}
                      onChange={(e) =>
                        setEditVolume(
                          e.target.value === '' ? '' : Number(e.target.value)
                        )
                      }
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-unit">
                      {t('waterContainerManager.unit', 'Unit')}
                    </Label>
                    <Select
                      value={editUnit}
                      onValueChange={(value: 'ml' | 'oz' | 'liter') =>
                        setEditUnit(value)
                      }
                    >
                      <SelectTrigger id="edit-unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ml">ml</SelectItem>
                        <SelectItem value="oz">oz</SelectItem>
                        <SelectItem value="liter">
                          {t('waterContainerManager.liter', 'liter')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              {editLinkedFood ? null : (
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-servings">
                    {t(
                      'waterContainerManager.servings',
                      'Servings per Container'
                    )}
                  </Label>
                  <Input
                    id="edit-servings"
                    type="number"
                    min="1"
                    value={editServings}
                    onChange={(e) =>
                      setEditServings(
                        e.target.value === '' ? '' : Number(e.target.value)
                      )
                    }
                    required
                  />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="edit-hydrationFactor">
                  {t(
                    'waterContainerManager.hydrationFactor',
                    'Hydration Factor'
                  )}
                </Label>
                <Input
                  id="edit-hydrationFactor"
                  type="number"
                  min="0"
                  max="2"
                  step="0.05"
                  value={editHydrationFactor}
                  onChange={(e) =>
                    setEditHydrationFactor(Number(e.target.value))
                  }
                />
                {renderHydrationHelp(
                  editHydrationFactor,
                  editFoodVariants,
                  editLinkedVariantId,
                  editLinkedQuantity,
                  !!editLinkedFood,
                  editVolume,
                  editServings,
                  editUnit
                )}
              </div>
            </div>

            <div className="grid gap-1.5 pt-2 border-t border-gray-200 dark:border-slate-800">
              <Label>
                {t('waterContainerManager.linkedFood', 'Linked Food')}
              </Label>
              {editLinkedFood ? (
                <div className="flex flex-col gap-2 p-2.5 border rounded-md bg-muted/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Utensils className="w-4 h-4 text-blue-500" />
                      <span>{editLinkedFood.name}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditLinkedFood(null);
                        setEditFoodVariants([]);
                        setEditLinkedVariantId(null);
                        setEditLinkedMealTypeId(null);
                      }}
                      className="h-6 px-2 text-xs text-red-500 hover:text-red-700"
                    >
                      <X className="w-3 h-3 mr-1" />
                      {t('waterContainerManager.unlinkFood', 'Unlink')}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {t('waterContainerManager.perPress', 'One press logs')}{' '}
                      <span className="font-medium text-foreground">
                        {describeLink(
                          editFoodVariants,
                          editLinkedVariantId,
                          editLinkedQuantity
                        )}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setSearchTarget('edit');
                        setUnitSelectorFood(editLinkedFood);
                      }}
                    >
                      {t(
                        'waterContainerManager.changeQuantity',
                        'Change quantity/unit'
                      )}
                    </Button>
                  </div>
                  {availableMealTypes.length > 0 && (
                    <div className="grid gap-1">
                      <Label className="text-xs">
                        {t(
                          'waterContainerManager.selectMealType',
                          'Meal Category'
                        )}
                      </Label>
                      <Select
                        value={editLinkedMealTypeId || 'none'}
                        onValueChange={(val) =>
                          setEditLinkedMealTypeId(val === 'none' ? null : val)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue
                            placeholder={t(
                              'waterContainerManager.selectMealTypePlaceholder',
                              'Select meal category (optional)'
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {t(
                              'waterContainerManager.selectMealTypePlaceholder',
                              'Select meal category (optional)'
                            )}
                          </SelectItem>
                          {availableMealTypes.map((mt) => (
                            <SelectItem key={mt.id} value={mt.id}>
                              {mt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenFoodSearch('edit')}
                  className="flex items-center justify-center gap-1.5 h-10 border-dashed"
                >
                  <Link2 className="w-4 h-4" />
                  {t('waterContainerManager.linkFood', 'Link to Food Item')}
                </Button>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContainer(null)}>
              {t('waterContainerManager.cancel', 'Cancel')}
            </Button>
            <Button onClick={handleSaveEdit}>
              {t('waterContainerManager.saveChanges', 'Save Changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Food Search Dialog */}
      {unitSelectorFood && (
        <FoodUnitSelector
          food={unitSelectorFood}
          open={!!unitSelectorFood}
          onOpenChange={(open) => {
            if (!open) setUnitSelectorFood(null);
          }}
          onSelect={handleUnitSelected}
          showUnitSelector
          initialQuantity={
            isReopeningLink
              ? Number(
                  searchTarget === 'add' ? linkedQuantity : editLinkedQuantity
                ) || undefined
              : undefined
          }
          initialVariantId={
            (isReopeningLink
              ? searchTarget === 'add'
                ? linkedVariantId
                : editLinkedVariantId
              : null) ?? undefined
          }
        />
      )}

      <FoodSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        onFoodSelect={handleFoodSelect}
        hideMealTab={true}
        title={t('waterContainerManager.searchFood', 'Search Food to Link')}
      />
    </div>
  );
};

export default WaterContainerManager;
