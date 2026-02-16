import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { GoalPreset } from '@/api/Goals/goals';

interface GoalPresetsSectionProps {
  handleCreatePresetClick: () => void;
  handleDeletePreset: (presetId: string) => void;
  handleEditPresetClick: (preset: GoalPreset) => void;
  goalPresets: GoalPreset[];
}

export const GoalPresetsSection = ({
  handleCreatePresetClick,
  handleDeletePreset,
  handleEditPresetClick,
  goalPresets,
}: GoalPresetsSectionProps) => {
  const { t } = useTranslation();
  const { energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold">
          {t('goals.goalsSettings.goalPresets', 'Goal Presets')}
        </CardTitle>
        <Button size="sm" onClick={handleCreatePresetClick}>
          <PlusCircle className="w-4 h-4 mr-2" />{' '}
          {t('goals.goalsSettings.createNewPreset', 'Create New Preset')}
        </Button>
      </CardHeader>
      <CardContent>
        {goalPresets.length === 0 ? (
          <p className="text-gray-500">
            {t(
              'goals.goalsSettings.noGoalPresets',
              'No goal presets defined yet. Create one to get started!'
            )}
          </p>
        ) : (
          <div className="space-y-4">
            {goalPresets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between p-3 border rounded-md"
              >
                <div>
                  <h4 className="font-semibold">{preset.preset_name}</h4>
                  <p className="text-sm text-gray-600">
                    {t('goals.goalsSettings.presetKcalMacros', {
                      calories: Math.round(
                        convertEnergy(preset.calories, 'kcal', energyUnit)
                      ),
                      protein: Math.round(preset.protein || 0),
                      carbs: Math.round(preset.carbs || 0),
                      fat: Math.round(preset.fat || 0),
                      energyUnit: getEnergyUnitString(energyUnit),
                      defaultValue:
                        '{{calories}} {{energyUnit}}, {{protein}}g P, {{carbs}}g C, {{fat}}g F',
                    })}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditPresetClick(preset)}
                  >
                    <Edit className="w-4 h-4" />{' '}
                    {t('goals.goalsSettings.edit', 'Edit')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => preset.id && handleDeletePreset(preset.id)}
                  >
                    <Trash2 className="w-4 h-4" />{' '}
                    {t('goals.goalsSettings.delete', 'Delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
