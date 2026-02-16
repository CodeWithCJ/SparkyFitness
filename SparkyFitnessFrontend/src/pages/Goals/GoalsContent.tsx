import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { type GoalPreset } from '@/api/Goals/goals';
import { type WeeklyGoalPlan } from '@/api/Goals/goals';

import type { ExpandedGoals } from '@/types/goals';
import {
  useDeletePresetMutation,
  useDeleteWeeklyPlanMutation,
  useGoalPresets,
} from '@/hooks/Goals/useGoals';
import { WeeklyGoalPlanDialog } from './WeeklyGoalPlanDialog';
import { WeeklyGoalPlansSection } from './WeeklyGoalPlansSection';
import { GoalPresetsSection } from './GoalPresetsSection';
import { DailyGoals } from './DailyGoals';
import { ResetOnboarding } from './ResetOnboarding';
import { GoalPresetDialog } from './GoalPresetDialog';

export const GoalsContent = ({
  today,
  initialData,
}: {
  initialData: ExpandedGoals;
  today: string;
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, nutrientDisplayPreferences } =
    usePreferences();

  const [currentWeeklyPlan, setCurrentWeeklyPlan] =
    useState<WeeklyGoalPlan | null>(null);
  // State for Goal Presets
  const [isPresetDialogOpen, setIsPresetDialogOpen] = useState(false);
  const [presetToEdit, setPresetToEdit] = useState<GoalPreset | null>(null);
  const [goals, setGoals] = useState<ExpandedGoals>(initialData);
  // State for Weekly Goal Plans
  const [isWeeklyPlanDialogOpen, setIsWeeklyPlanDialogOpen] = useState(false);
  useState<WeeklyGoalPlan | null>(null);

  const { data: goalPresets = [] } = useGoalPresets();

  // --- Goal Presets Mutations ---
  const { mutateAsync: deleteGoalPreset } = useDeletePresetMutation();

  // --- Weekly Goal Plans Mutations ---
  const { mutateAsync: deleteWeeklyGoalPlan } = useDeleteWeeklyPlanMutation();

  const handleCreatePresetClick = () => {
    setPresetToEdit(null);
    setIsPresetDialogOpen(true);
  };

  const handleEditPresetClick = (preset: GoalPreset) => {
    setPresetToEdit(preset);
    setIsPresetDialogOpen(true);
  };

  const handleDeletePreset = async (presetId: string) => {
    if (
      !confirm(
        t(
          'goals.goalsSettings.deletePresetConfirm',
          'Are you sure you want to delete this preset?'
        )
      )
    )
      return;
    await deleteGoalPreset(presetId);
  };

  // Weekly Plan Functions

  const handleCreateWeeklyPlanClick = () => {
    setCurrentWeeklyPlan({
      plan_name: '',
      start_date: formatDateInUserTimezone(new Date(), 'yyyy-MM-dd'), // Changed
      end_date: null,
      is_active: true,
      monday_preset_id: null,
      tuesday_preset_id: null,
      wednesday_preset_id: null,
      thursday_preset_id: null,
      friday_preset_id: null,
      saturday_preset_id: null,
      sunday_preset_id: null,
    });
    setIsWeeklyPlanDialogOpen(true);
  };

  const handleEditWeeklyPlanClick = (plan: WeeklyGoalPlan) => {
    setCurrentWeeklyPlan({ ...plan });
    setIsWeeklyPlanDialogOpen(true);
  };

  const handleDeleteWeeklyPlan = async (planId: string) => {
    if (
      !confirm(
        t(
          'goals.goalsSettings.deleteWeeklyPlanConfirm',
          'Are you sure you want to delete this weekly plan?'
        )
      )
    )
      return;
    await deleteWeeklyGoalPlan(planId);
  };

  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const goalPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === 'goal' && p.platform === platform
  );
  const visibleNutrients = goalPreferences
    ? goalPreferences.visible_nutrients
    : Object.keys(goals);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {t('goals.goalsSettings.title', 'Goals Settings')}
        </h2>
        <Badge variant="outline" className="text-lg px-3 py-1">
          <Target className="w-4 h-4 mr-2" />
          {t('goals.goalsSettings.cascadingGoals', 'Cascading Goals')}
        </Badge>
      </div>

      {/* Reset Onboarding */}
      <ResetOnboarding />

      {/* Daily Goals */}
      <DailyGoals
        today={today}
        goals={goals}
        setGoals={setGoals}
        visibleNutrients={visibleNutrients}
      />

      {/* Goal Presets Section */}
      <GoalPresetsSection
        goalPresets={goalPresets}
        handleCreatePresetClick={handleCreatePresetClick}
        handleDeletePreset={handleDeletePreset}
        handleEditPresetClick={handleEditPresetClick}
      />

      {/* Goal Preset Dialog */}
      <GoalPresetDialog
        key={presetToEdit?.id || (isPresetDialogOpen ? 'new' : 'closed')}
        open={isPresetDialogOpen}
        onOpenChange={setIsPresetDialogOpen}
        preset={presetToEdit}
        visibleNutrients={visibleNutrients}
      />
      {/* Weekly Goal Plans Section */}
      <WeeklyGoalPlansSection
        handleCreateWeeklyPlanClick={handleCreateWeeklyPlanClick}
        handleDeleteWeeklyPlan={handleDeleteWeeklyPlan}
        handleEditWeeklyPlanClick={handleEditWeeklyPlanClick}
      />

      {/* Weekly Goal Plan Dialog */}
      <WeeklyGoalPlanDialog
        open={isWeeklyPlanDialogOpen}
        onOpenChange={setIsWeeklyPlanDialogOpen}
        goalPresets={goalPresets}
        plan={currentWeeklyPlan}
      />
    </div>
  );
};
