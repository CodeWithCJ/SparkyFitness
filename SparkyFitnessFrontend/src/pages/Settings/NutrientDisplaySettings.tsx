import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
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

const NutrientDisplaySettings: React.FC = () => {
  const { nutrientDisplayPreferences, loadNutrientDisplayPreferences } =
    usePreferences();
  const [preferences, setPreferences] = useState<NutrientPreference[]>([]);
  const [syncState, setSyncState] = useState<Record<string, boolean>>({});
  const [activePlatformTab, setActivePlatformTab] = useState<
    'desktop' | 'mobile'
  >('desktop');
  const [activeViewGroupTab, setActiveViewGroupTab] =
    useState<string>('summary');

  const { data: customNutrients = [] } = useCustomNutrients();
  const { mutateAsync: updatePreference } =
    useUpdateNutrientPreferenceMutation();
  const { mutateAsync: resetPreference } = useResetNutrientPreferenceMutation();
  const allNutrients = [
    ...baseNutrients,
    ...customNutrients.map((n) => n.name),
  ];
  useEffect(() => {
    setPreferences(nutrientDisplayPreferences);
  }, [nutrientDisplayPreferences]);

  const savePreferences = useCallback(async () => {
    const changedPreferences = preferences.filter((p) => {
      const originalPref = nutrientDisplayPreferences.find(
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        toast({
          title: 'Error',
          description: `Failed to save ${pref.view_group} (${pref.platform}) preferences: ${error.message}`,
          variant: 'destructive',
        });
      }
    }
    loadNutrientDisplayPreferences();
  }, [
    nutrientDisplayPreferences,
    preferences,
    loadNutrientDisplayPreferences,
    updatePreference,
  ]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (
        JSON.stringify(preferences) !==
        JSON.stringify(nutrientDisplayPreferences)
      ) {
        savePreferences();
      }
    }, 1000);

    return () => {
      clearTimeout(handler);
    };
  }, [preferences, nutrientDisplayPreferences, savePreferences]);

  const updatePreferences = (
    viewGroup: string,
    platform: 'desktop' | 'mobile',
    newNutrients: string[]
  ) => {
    setPreferences((prev) => {
      const newPrefs = [...prev];
      const prefIndex = newPrefs.findIndex(
        (p) => p.view_group === viewGroup && p.platform === platform
      );
      if (prefIndex > -1) {
        newPrefs[prefIndex] = {
          ...newPrefs[prefIndex],
          visible_nutrients: newNutrients,
        };
      } else {
        newPrefs.push({
          view_group: viewGroup,
          platform,
          visible_nutrients: newNutrients,
        });
      }
      return newPrefs;
    });
  };

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
      const pref = preferences.find(
        (p) => p.view_group === viewGroup && p.platform === pform
      );
      const currentNutrients = pref ? pref.visible_nutrients : [];
      let newNutrients: string[];
      if (checked) {
        newNutrients = [...currentNutrients, nutrient];
      } else {
        newNutrients = currentNutrients.filter((n) => n !== nutrient);
      }
      updatePreferences(viewGroup, pform, newNutrients);
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
    platformsToUpdate.forEach((pform) =>
      updatePreferences(viewGroup, pform, allNutrients)
    );
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
        if (defaultPreference && defaultPreference.visible_nutrients) {
          updatePreferences(
            viewGroup,
            pform,
            defaultPreference.visible_nutrients
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        toast({
          title: 'Error',
          description: `Failed to reset ${viewGroup} (${pform}) preferences: ${error.message}`,
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
    }
  };

  return (
    <div className="space-y-4">
      <Tabs
        value={activePlatformTab}
        onValueChange={(value) =>
          setActivePlatformTab(value as 'desktop' | 'mobile')
        }
      >
        <TabsList className="h-10 ">
          <TabsTrigger value="desktop">Desktop</TabsTrigger>
          <TabsTrigger value="mobile">Mobile</TabsTrigger>
        </TabsList>
        {['desktop', 'mobile'].map((platform) => (
          <TabsContent key={platform} value={platform}>
            <Tabs
              value={activeViewGroupTab}
              onValueChange={setActiveViewGroupTab}
            >
              <TabsList className="h-10 ">
                {viewGroups.map((group) => (
                  <TabsTrigger key={group.id} value={group.id}>
                    {group.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              {viewGroups.map((group) => (
                <TabsContent key={group.id} value={group.id}>
                  <p className="text-sm text-muted-foreground mb-4">
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
                    {allNutrients.map((nutrient) => {
                      const preference = preferences.find(
                        (p) =>
                          p.view_group === group.id && p.platform === platform
                      );
                      const isChecked =
                        preference?.visible_nutrients.includes(nutrient) ||
                        false;
                      return (
                        <div
                          key={nutrient}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`${group.id}-${platform}-${nutrient}`}
                            checked={isChecked}
                            onCheckedChange={(checked) =>
                              handleCheckboxChange(
                                group.id,
                                platform as 'desktop' | 'mobile',
                                nutrient,
                                !!checked
                              )
                            }
                          />
                          <Label
                            htmlFor={`${group.id}-${platform}-${nutrient}`}
                            className="capitalize cursor-pointer"
                          >
                            {nutrient.replace(/_/g, ' ')}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-6 pt-4 border-t">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`sync-${group.id}-${platform}`}
                        checked={syncState[group.id] || false}
                        onCheckedChange={() =>
                          handleSyncToggle(
                            group.id,
                            platform as 'desktop' | 'mobile'
                          )
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
                      onClick={() =>
                        handleSelectAll(
                          group.id,
                          platform as 'desktop' | 'mobile'
                        )
                      }
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleClearAll(
                          group.id,
                          platform as 'desktop' | 'mobile'
                        )
                      }
                    >
                      Clear All
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleReset(group.id, platform as 'desktop' | 'mobile')
                      }
                    >
                      Reset to Default
                    </Button>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default NutrientDisplaySettings;
