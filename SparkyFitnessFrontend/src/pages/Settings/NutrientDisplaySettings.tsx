import type React from 'react';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import {
  useResetNutrientPreferenceMutation,
  useUpdateNutrientPreferenceMutation,
} from '@/hooks/Settings/useNutrientPreferences';
import { getErrorMessage } from '@/utils/api';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CENTRAL_NUTRIENT_CONFIG } from '@/constants/nutrients';

const baseNutrients = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
  'sugars',
  'sodium',
  'cholesterol',
  'saturated_fat',
  'monounsaturated_fat',
  'polyunsaturated_fat',
  'trans_fat',
  'potassium',
  'vitamin_a',
  'vitamin_c',
  'iron',
  'calcium',
  'glycemic_index',
];

const viewGroups = [
  { id: 'summary', name: 'Summary' },
  { id: 'quick_info', name: 'Quick Info' },
  { id: 'food_database', name: 'Food Database' },
  { id: 'goal', name: 'Goal' },
  { id: 'report_tabular', name: 'Report (Tabular)' },
  { id: 'report_chart', name: 'Report (Chart)' },
];

interface NutrientPreference {
  view_group: string;
  platform: 'desktop' | 'mobile';
  visible_nutrients: string[];
}

function buildOrderedList(
  visibleNutrients: string[],
  allNutrients: string[]
): string[] {
  const visibleSet = new Set(visibleNutrients);
  const rest = allNutrients.filter((n) => !visibleSet.has(n));
  return [...visibleNutrients, ...rest];
}

interface SortableNutrientRowProps {
  nutrient: string;
  isVisible: boolean;
  onToggle: (nutrient: string, checked: boolean) => void;
}

function SortableNutrientRow({
  nutrient,
  isVisible,
  onToggle,
}: SortableNutrientRowProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: nutrient });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getNutrientLabel = (key: string) => {
    const config = CENTRAL_NUTRIENT_CONFIG[key];
    if (config) {
      return t(config.label, { defaultValue: config.defaultLabel });
    }
    return key;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 group"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity touch-none"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${nutrient}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox
        id={`row-${nutrient}`}
        checked={isVisible}
        onCheckedChange={(checked) => onToggle(nutrient, !!checked)}
      />
      <Label
        htmlFor={`row-${nutrient}`}
        className="capitalize cursor-pointer select-none"
      >
        {getNutrientLabel(nutrient)}
      </Label>
    </div>
  );
}

function buildInitialOrder(
  preferences: NutrientPreference[],
  allNutrients: string[]
) {
  const initialOrder: Record<string, Record<string, string[]>> = {};
  for (const group of viewGroups) {
    const groupOrders: Record<'desktop' | 'mobile', string[]> = {
      desktop: [],
      mobile: [],
    };

    for (const platform of ['desktop', 'mobile'] as const) {
      const pref = preferences.find(
        (p) => p.view_group === group.id && p.platform === platform
      );
      groupOrders[platform] = buildOrderedList(
        pref?.visible_nutrients ?? [],
        allNutrients
      );
    }

    initialOrder[group.id] = groupOrders;
  }
  return initialOrder;
}

interface NutrientDisplaySettingsInnerProps {
  initialPreferences: NutrientPreference[];
  customNutrients: { name: string }[];
  updatePreference: (variables: {
    viewGroup: string;
    platform: 'desktop' | 'mobile';
    visibleNutrients: string[];
  }) => Promise<unknown>;
  resetPreference: (variables: {
    viewGroup: string;
    platform: 'desktop' | 'mobile';
  }) => Promise<{ visible_nutrients?: string[] }>;
  loadNutrientDisplayPreferences: () => void;
}

const NutrientDisplaySettingsInner: React.FC<
  NutrientDisplaySettingsInnerProps
> = ({
  initialPreferences,
  customNutrients,
  updatePreference,
  resetPreference,
  loadNutrientDisplayPreferences,
}) => {
  const allNutrients = useMemo(
    () => [...baseNutrients, ...customNutrients.map((n) => n.name)],
    [customNutrients]
  );

  const [preferences, setPreferences] =
    useState<NutrientPreference[]>(initialPreferences);
  const [nutrientOrder, setNutrientOrder] = useState<
    Record<string, Record<string, string[]>>
  >(() => buildInitialOrder(initialPreferences, allNutrients));
  const [syncState, setSyncState] = useState<Record<string, boolean>>({});
  const [activePlatformTab, setActivePlatformTab] = useState<
    'desktop' | 'mobile'
  >('desktop');
  const [activeViewGroupTab, setActiveViewGroupTab] =
    useState<string>('summary');

  const getVisibleNutrients = useCallback(
    (viewGroup: string, platform: string): string[] => {
      const pref = preferences.find(
        (p) => p.view_group === viewGroup && p.platform === platform
      );
      return pref?.visible_nutrients ?? [];
    },
    [preferences]
  );

  const updatePreferences = useCallback(
    (
      viewGroup: string,
      platform: 'desktop' | 'mobile',
      newNutrients: string[]
    ) => {
      setPreferences((prev) => {
        const next = [...prev];
        const idx = next.findIndex(
          (p) => p.view_group === viewGroup && p.platform === platform
        );
        if (idx > -1) {
          next[idx] = { ...next[idx]!, visible_nutrients: newNutrients };
        } else {
          next.push({
            view_group: viewGroup,
            platform,
            visible_nutrients: newNutrients,
          });
        }
        return next;
      });
    },
    []
  );

  const savePreferences = useCallback(async () => {
    const changedPreferences = preferences.filter((p) => {
      const originalPref = initialPreferences.find(
        (op) => op.view_group === p.view_group && op.platform === p.platform
      );
      return (
        !originalPref ||
        JSON.stringify(p.visible_nutrients) !==
          JSON.stringify(originalPref.visible_nutrients)
      );
    });

    for (const pref of changedPreferences) {
      try {
        await updatePreference({
          viewGroup: pref.view_group,
          platform: pref.platform,
          visibleNutrients: pref.visible_nutrients,
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        toast({
          title: 'Error',
          description: `Failed to save ${pref.view_group} (${pref.platform}) preferences: ${message}`,
          variant: 'destructive',
        });
      }
    }
    loadNutrientDisplayPreferences();
  }, [
    initialPreferences,
    preferences,
    loadNutrientDisplayPreferences,
    updatePreference,
  ]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (JSON.stringify(preferences) !== JSON.stringify(initialPreferences)) {
        savePreferences();
      }
    }, 1000);
    return () => clearTimeout(handler);
  }, [preferences, initialPreferences, savePreferences]);

  const handleCheckboxChange = (
    viewGroup: string,
    platform: 'desktop' | 'mobile',
    nutrient: string,
    checked: boolean
  ) => {
    const isSynced = syncState[viewGroup] || false;
    const platformsToUpdate: ('desktop' | 'mobile')[] = isSynced
      ? ['desktop', 'mobile']
      : [platform];

    platformsToUpdate.forEach((pform) => {
      const order =
        nutrientOrder[viewGroup]?.[pform] ??
        buildOrderedList(getVisibleNutrients(viewGroup, pform), allNutrients);
      const currentVisible = getVisibleNutrients(viewGroup, pform);
      const newVisible = checked
        ? order.filter((n) => n === nutrient || currentVisible.includes(n))
        : currentVisible.filter((n) => n !== nutrient);
      updatePreferences(viewGroup, pform, newVisible);
    });
  };

  const handleDragEnd = (
    event: DragEndEvent,
    viewGroup: string,
    platform: 'desktop' | 'mobile'
  ) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const isSynced = syncState[viewGroup] || false;
    const platformsToUpdate: ('desktop' | 'mobile')[] = isSynced
      ? ['desktop', 'mobile']
      : [platform];

    platformsToUpdate.forEach((pform) => {
      const currentOrder =
        nutrientOrder[viewGroup]?.[pform] ??
        buildOrderedList(getVisibleNutrients(viewGroup, pform), allNutrients);
      const oldIndex = currentOrder.indexOf(active.id as string);
      const newIndex = currentOrder.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(currentOrder, oldIndex, newIndex);

      setNutrientOrder((prev) => ({
        ...prev,
        [viewGroup]: { ...(prev[viewGroup] ?? {}), [pform]: newOrder },
      }));

      const currentVisible = new Set(getVisibleNutrients(viewGroup, pform));
      const newVisible = newOrder.filter((n) => currentVisible.has(n));
      updatePreferences(viewGroup, pform, newVisible);
    });
  };

  const handleSelectAll = (
    viewGroup: string,
    platform: 'desktop' | 'mobile'
  ) => {
    const isSynced = syncState[viewGroup] || false;
    const platformsToUpdate: ('desktop' | 'mobile')[] = isSynced
      ? ['desktop', 'mobile']
      : [platform];
    platformsToUpdate.forEach((pform) => {
      const order =
        nutrientOrder[viewGroup]?.[pform] ??
        buildOrderedList(getVisibleNutrients(viewGroup, pform), allNutrients);
      updatePreferences(viewGroup, pform, order);
    });
  };

  const handleClearAll = (
    viewGroup: string,
    platform: 'desktop' | 'mobile'
  ) => {
    const isSynced = syncState[viewGroup] || false;
    const platformsToUpdate: ('desktop' | 'mobile')[] = isSynced
      ? ['desktop', 'mobile']
      : [platform];
    platformsToUpdate.forEach((pform) =>
      updatePreferences(viewGroup, pform, [])
    );
  };

  const handleReset = async (
    viewGroup: string,
    platform: 'desktop' | 'mobile'
  ) => {
    const isSynced = syncState[viewGroup] || false;
    const platformsToReset: ('desktop' | 'mobile')[] = isSynced
      ? ['desktop', 'mobile']
      : [platform];

    for (const pform of platformsToReset) {
      try {
        const defaultPreference = await resetPreference({
          viewGroup,
          platform: pform,
        });
        if (defaultPreference?.visible_nutrients) {
          updatePreferences(
            viewGroup,
            pform,
            defaultPreference.visible_nutrients
          );
          setNutrientOrder((prev) => ({
            ...prev,
            [viewGroup]: {
              ...(prev[viewGroup] ?? {}),
              [pform]: buildOrderedList(
                defaultPreference.visible_nutrients ?? [],
                allNutrients
              ),
            },
          }));
        }
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        toast({
          title: 'Error',
          description: `Failed to reset ${viewGroup} (${pform}) preferences: ${message}`,
          variant: 'destructive',
        });
      }
    }
    toast({
      title: 'Success',
      description: `Preferences for ${viewGroup} (${platformsToReset.join(' & ')}) have been reset to default.`,
    });
  };

  const handleSyncToggle = (
    viewGroup: string,
    platform: 'desktop' | 'mobile'
  ) => {
    const newSyncState = !syncState[viewGroup];
    setSyncState((prev) => ({ ...prev, [viewGroup]: newSyncState }));

    if (newSyncState) {
      const sourcePref = preferences.find(
        (p) => p.view_group === viewGroup && p.platform === platform
      );
      const targetPlatform = platform === 'desktop' ? 'mobile' : 'desktop';
      if (sourcePref) {
        updatePreferences(
          viewGroup,
          targetPlatform,
          sourcePref.visible_nutrients
        );
      }
      const sourceOrder = nutrientOrder[viewGroup]?.[platform];
      if (sourceOrder) {
        setNutrientOrder((prev) => ({
          ...prev,
          [viewGroup]: {
            ...(prev[viewGroup] ?? {}),
            [targetPlatform]: sourceOrder,
          },
        }));
      }
    }
  };

  const sensors = useSensors(useSensor(PointerSensor));

  return (
    <div className="space-y-4">
      <Tabs
        value={activePlatformTab}
        onValueChange={(value) =>
          setActivePlatformTab(value as 'desktop' | 'mobile')
        }
      >
        <TabsList className="h-10">
          <TabsTrigger value="desktop">Desktop</TabsTrigger>
          <TabsTrigger value="mobile">Mobile</TabsTrigger>
        </TabsList>

        {(['desktop', 'mobile'] as const).map((platform) => (
          <TabsContent key={platform} value={platform}>
            <Tabs
              value={activeViewGroupTab}
              onValueChange={setActiveViewGroupTab}
            >
              <TabsList className="h-10">
                {viewGroups.map((group) => (
                  <TabsTrigger key={group.id} value={group.id}>
                    {group.name}
                  </TabsTrigger>
                ))}
              </TabsList>

              {viewGroups.map((group) => {
                const visibleSet = new Set(
                  getVisibleNutrients(group.id, platform)
                );
                const orderedList =
                  nutrientOrder[group.id]?.[platform] ??
                  buildOrderedList(
                    getVisibleNutrients(group.id, platform),
                    allNutrients
                  );

                return (
                  <TabsContent key={group.id} value={group.id}>
                    <p className="text-sm text-muted-foreground mb-1">
                      {group.id === 'summary'
                        ? 'Controls the Nutrition Summary and 14-Day Trends on the Diary page.'
                        : group.id === 'quick_info'
                          ? 'Controls nutrients shown for individual food entries, meal totals, food search results, and the food database.'
                          : group.id === 'food_database'
                            ? 'Controls nutrients shown when editing foods in your database.'
                            : group.id === 'goal'
                              ? 'Controls nutrients shown when setting or editing your goals.'
                              : group.id === 'report_tabular'
                                ? 'Controls nutrient columns in the Reports table view.'
                                : 'Controls which nutrients are available for charts in the Reports section.'}
                    </p>

                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEnd(e, group.id, platform)}
                    >
                      <SortableContext
                        items={orderedList}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-0.5">
                          {orderedList.map((nutrient) => (
                            <SortableNutrientRow
                              key={nutrient}
                              nutrient={nutrient}
                              isVisible={visibleSet.has(nutrient)}
                              onToggle={(n, checked) =>
                                handleCheckboxChange(
                                  group.id,
                                  platform,
                                  n,
                                  checked
                                )
                              }
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    <div className="flex items-center gap-4 mt-6 pt-4 border-t flex-wrap">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`sync-${group.id}-${platform}`}
                          checked={syncState[group.id] || false}
                          onCheckedChange={() =>
                            handleSyncToggle(group.id, platform)
                          }
                        />
                        <Label
                          className="cursor-pointer"
                          htmlFor={`sync-${group.id}-${platform}`}
                        >
                          Sync with{' '}
                          {platform === 'desktop' ? 'Mobile' : 'Desktop'}
                        </Label>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => handleSelectAll(group.id, platform)}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleClearAll(group.id, platform)}
                      >
                        Clear All
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleReset(group.id, platform)}
                      >
                        Reset to Default
                      </Button>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

const NutrientDisplaySettings = () => {
  const { nutrientDisplayPreferences, loadNutrientDisplayPreferences } =
    usePreferences();
  const { data: customNutrients = [], isSuccess } = useCustomNutrients();
  const { mutateAsync: updatePreference } =
    useUpdateNutrientPreferenceMutation();
  const { mutateAsync: resetPreference } = useResetNutrientPreferenceMutation();

  const isDataLoaded = nutrientDisplayPreferences.length > 0 || isSuccess;

  if (!isDataLoaded) {
    return null;
  }

  const componentKey =
    nutrientDisplayPreferences.length > 0 ? 'loaded' : 'default';

  return (
    <NutrientDisplaySettingsInner
      key={componentKey}
      initialPreferences={nutrientDisplayPreferences}
      customNutrients={customNutrients}
      updatePreference={updatePreference}
      resetPreference={resetPreference}
      loadNutrientDisplayPreferences={loadNutrientDisplayPreferences}
    />
  );
};

export default NutrientDisplaySettings;
