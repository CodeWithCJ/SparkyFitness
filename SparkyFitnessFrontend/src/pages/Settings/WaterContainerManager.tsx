import type React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { convertMlToSelectedUnit } from '@/utils/nutritionCalculations';
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
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  useWaterContainersQuery,
  useCreateWaterContainerMutation,
  useUpdateWaterContainerMutation,
  useDeleteWaterContainerMutation,
  useSetPrimaryWaterContainerMutation,
} from '@/hooks/Settings/useWaterContainers';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import { foodViewOptions } from '@/hooks/Foods/useFoods';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import FoodSearchDialog from '@/components/FoodSearch/FoodSearchDialog';
import type { Food, FoodVariant } from '@/types/food';
import type { Meal } from '@/types/meal';
import type { WaterContainer } from '@/types/settings';
import { Utensils, X, Edit2, Link2 } from 'lucide-react';

const WaterContainerManager: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();

  // Add container form state
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

  // Food search dialog state
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [searchTarget, setSearchTarget] = useState<'add' | 'edit'>('add');

  const queryClient = useQueryClient();
  const { data: containers = [] } = useWaterContainersQuery(user?.activeUserId);
  const { data: availableMealTypes = [] } = useMealTypes();
  const { mutateAsync: createWaterContainer } =
    useCreateWaterContainerMutation();
  const { mutateAsync: updateWaterContainer } =
    useUpdateWaterContainerMutation();
  const { mutateAsync: deleteWaterContainer } =
    useDeleteWaterContainerMutation();
  const { mutateAsync: setPrimaryWaterContainer } =
    useSetPrimaryWaterContainerMutation();

  const handleOpenFoodSearch = (target: 'add' | 'edit') => {
    setSearchTarget(target);
    setSearchDialogOpen(true);
  };

  const handleFoodSelect = async (item: Food | Meal, type: 'food' | 'meal') => {
    if (type !== 'food' || !item.id) return;
    try {
      const fullFood = await queryClient.fetchQuery(foodViewOptions(item.id));
      const variants = fullFood?.variants || [];
      const defaultVar =
        variants.find((v: FoodVariant) => v.is_default) || variants[0];
      const defaultVariantId = defaultVar?.id || null;

      if (searchTarget === 'add') {
        setLinkedFood(fullFood ?? null);
        setFoodVariants(variants);
        setLinkedVariantId(defaultVariantId);
      } else {
        setEditLinkedFood(fullFood ?? null);
        setEditFoodVariants(variants);
        setEditLinkedVariantId(defaultVariantId);
      }
    } catch {
      // Fallback to basic selected item if full details fail
      const foodItem = item as Food;
      if (searchTarget === 'add') {
        setLinkedFood(foodItem);
        setFoodVariants([]);
        setLinkedVariantId(null);
      } else {
        setEditLinkedFood(foodItem);
        setEditFoodVariants([]);
        setEditLinkedVariantId(null);
      }
    }
    setSearchDialogOpen(false);
  };

  const handleAddContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || volume === '' || servingsPerContainer === '') return;
    await createWaterContainer({
      name,
      volume: Number(volume),
      unit,
      is_primary: false,
      servings_per_container: Number(servingsPerContainer),
      hydration_factor: Number(hydrationFactor) || 1.0,
      linked_food_id: linkedFood ? linkedFood.id : null,
      linked_variant_id: linkedVariantId,
      linked_meal_type_id: linkedMealTypeId,
    });
    setName('');
    setVolume('');
    setServingsPerContainer('');
    setHydrationFactor(1.0);
    setLinkedFood(null);
    setFoodVariants([]);
    setLinkedVariantId(null);
    setLinkedMealTypeId(null);
  };

  const handleStartEdit = async (container: WaterContainer) => {
    setEditingContainer(container);
    setEditName(container.name);
    setEditVolume(container.volume);
    setEditUnit(container.unit);
    setEditServings(container.servings_per_container);
    setEditHydrationFactor(container.hydration_factor ?? 1.0);
    setEditLinkedMealTypeId(container.linked_meal_type_id || null);

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
    if (
      !editingContainer ||
      !editName ||
      editVolume === '' ||
      editServings === ''
    )
      return;
    await updateWaterContainer({
      id: editingContainer.id,
      containerData: {
        name: editName,
        volume: Number(editVolume),
        unit: editUnit,
        servings_per_container: Number(editServings),
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

  return (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
                  setVolume(e.target.value === '' ? '' : Number(e.target.value))
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
                onValueChange={(value: 'ml' | 'oz' | 'liter') => setUnit(value)}
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
            <div className="grid gap-1.5">
              <Label htmlFor="servingsPerContainer">
                {t('waterContainerManager.servings', 'Servings per Container')}
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
          </div>

          {/* Hydration Factor & Optional Food Link Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-slate-800">
            <div className="grid gap-1.5">
              <Label htmlFor="hydrationFactor">
                {t('waterContainerManager.hydrationFactor', 'Hydration Factor')}
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
              <p className="text-[11px] text-muted-foreground">
                {t(
                  'waterContainerManager.hydrationFactorHelp',
                  'Scales water credit (e.g., 0.9 for coffee/tea, 1.0 for standard water). Full calories/macros are logged.'
                )}
              </p>
            </div>

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
                  {foodVariants.length > 0 && (
                    <div className="grid gap-1">
                      <Label className="text-xs">
                        {t(
                          'waterContainerManager.selectVariant',
                          'Serving Variant'
                        )}
                      </Label>
                      <Select
                        value={linkedVariantId || undefined}
                        onValueChange={(val) => setLinkedVariantId(val)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {foodVariants.map((v) => (
                            <SelectItem key={v.id} value={v.id || ''}>
                              {v.serving_size} {v.serving_unit}{' '}
                              {v.serving_description
                                ? `(${v.serving_description})`
                                : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
          </div>

          <Button type="submit">
            {t('waterContainerManager.add', 'Add Container')}
          </Button>
        </form>

        <div className="space-y-2">
          {containers.map((c) => (
            <div
              key={c.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-md gap-3 bg-card"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">
                    {c.name} -{' '}
                    {convertMlToSelectedUnit(c.volume, c.unit).toFixed(2)}{' '}
                    {c.unit === 'liter'
                      ? t('waterContainerManager.liter', 'liter')
                      : c.unit}{' '}
                    (
                    {t('waterContainerManager.servingsCount', {
                      count: c.servings_per_container,
                      defaultValue_one: '{{count}} serving',
                      defaultValue_other: '{{count}} servings',
                    })}
                    )
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
                        {t('waterContainerManager.linkedFood', 'Linked Food')}:{' '}
                        {c.linked_food_name || 'Food'}
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
                    {editFoodVariants.length > 0 && (
                      <div className="grid gap-1">
                        <Label className="text-xs">
                          {t(
                            'waterContainerManager.selectVariant',
                            'Serving Variant'
                          )}
                        </Label>
                        <Select
                          value={editLinkedVariantId || undefined}
                          onValueChange={(val) => setEditLinkedVariantId(val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {editFoodVariants.map((v) => (
                              <SelectItem key={v.id} value={v.id || ''}>
                                {v.serving_size} {v.serving_unit}{' '}
                                {v.serving_description
                                  ? `(${v.serving_description})`
                                  : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
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
              <Button
                variant="outline"
                onClick={() => setEditingContainer(null)}
              >
                {t('waterContainerManager.cancel', 'Cancel')}
              </Button>
              <Button onClick={handleSaveEdit}>
                {t('waterContainerManager.saveChanges', 'Save Changes')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Food Search Dialog */}
        <FoodSearchDialog
          open={searchDialogOpen}
          onOpenChange={setSearchDialogOpen}
          onFoodSelect={handleFoodSelect}
          hideMealTab={true}
          title={t('waterContainerManager.searchFood', 'Search Food to Link')}
        />
      </CardContent>
    </Card>
  );
};

export default WaterContainerManager;
