import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { Plus, Edit, Trash2, CalendarDays } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { error } from '@/utils/logging';
import type { WorkoutPlanTemplate } from '@/types/workout';
import AddWorkoutPlanDialog from './AddWorkoutPlanDialog';
import {
  useCreateWorkoutPlanTemplateMutation,
  useDeleteWorkoutPlanTemplateMutation,
  useUpdateWorkoutPlanTemplateMutation,
  useWorkoutPlanTemplates,
} from '@/hooks/Exercises/useWorkoutPlans';

const WorkoutPlansManager = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { loggingLevel } = usePreferences();
  const [isAddPlanDialogOpen, setIsAddPlanDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<WorkoutPlanTemplate | null>(
    null
  );

  const { data: plans } = useWorkoutPlanTemplates(user.id);
  const { mutateAsync: createWorkoutPlanTemplate } =
    useCreateWorkoutPlanTemplateMutation();
  const { mutateAsync: updateWorkoutPlanTemplate } =
    useUpdateWorkoutPlanTemplateMutation();
  const { mutateAsync: deleteWorkoutPlanTemplate } =
    useDeleteWorkoutPlanTemplateMutation();

  const handleCreatePlan = async (
    newPlanData: Omit<
      WorkoutPlanTemplate,
      'id' | 'user_id' | 'created_at' | 'updated_at'
    >
  ) => {
    if (!user?.id) return;
    try {
      await createWorkoutPlanTemplate({ userId: user.id, data: newPlanData });
      setIsAddPlanDialogOpen(false);
    } catch (err) {
      error(loggingLevel, 'Error creating workout plan:', err);
    }
  };

  const handleUpdatePlan = async (
    planId: string,
    updatedPlanData: Partial<WorkoutPlanTemplate>
  ) => {
    if (!user?.id) return;
    try {
      await updateWorkoutPlanTemplate({ id: planId, data: updatedPlanData });
      setIsEditDialogOpen(false);
      setSelectedPlan(null);
    } catch (err) {
      error(loggingLevel, 'Error updating workout plan:', err);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!user?.id) return;
    try {
      await deleteWorkoutPlanTemplate(planId);
    } catch (err) {
      error(loggingLevel, 'Error deleting workout plan:', err);
    }
  };

  const handleTogglePlanActive = async (planId: string, isActive: boolean) => {
    if (!user?.id) return;
    try {
      const planToUpdate = plans.find((p) => p.id === planId);
      if (!planToUpdate) {
        toast({
          title: t('common.error', 'Error'),
          description: t(
            'workoutPlansManager.updateStatusError',
            'Could not find the plan to update.'
          ),
          variant: 'destructive',
        });
        return;
      }
      await updateWorkoutPlanTemplate({
        id: planId,
        data: {
          ...planToUpdate,
          is_active: isActive,
        },
      });
    } catch (err) {
      error(loggingLevel, 'Error toggling workout plan active status:', err);
    }
  };

  if (!plans) {
    return;
  }
  return (
    <>
      <div className="flex flex-row items-center justify-end space-y-0 pb-2">
        <Button size="sm" onClick={() => setIsAddPlanDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('workoutPlansManager.addPlanButton', 'Add Plan')}
        </Button>
      </div>
      {plans.length === 0 ? (
        <p className="text-center text-muted-foreground">
          {t(
            'workoutPlansManager.noPlansFound',
            'No workout plans found. Create one to get started!'
          )}
        </p>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div>
                <h4 className="font-medium">{plan.plan_name}</h4>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
                <p className="text-xs text-muted-foreground flex items-center space-x-1">
                  <CalendarDays className="h-3 w-3" />
                  <span>{new Date(plan.start_date!).toLocaleDateString()}</span>
                  {plan.end_date && (
                    <>
                      <span>-</span>
                      <CalendarDays className="h-3 w-3" />
                      <span>
                        {new Date(plan.end_date).toLocaleDateString()}
                      </span>
                    </>
                  )}
                  {!plan.end_date && (
                    <span>
                      {t('workoutPlansManager.ongoingStatus', '- Ongoing')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('workoutPlansManager.statusLabel', 'Status: ')}{' '}
                  {plan.is_active
                    ? t('workoutPlansManager.activeStatus', 'Active')
                    : t('workoutPlansManager.inactiveStatus', 'Inactive')}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedPlan(plan);
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {t(
                          'workoutPlansManager.editPlanTooltip',
                          'Edit Workout Plan'
                        )}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeletePlan(plan.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {t(
                          'workoutPlansManager.deletePlanTooltip',
                          'Delete Workout Plan'
                        )}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`plan-active-${plan.id}`}
                      checked={plan.is_active}
                      onCheckedChange={(checked) =>
                        handleTogglePlanActive(plan.id, checked)
                      }
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <label
                          htmlFor={`plan-active-${plan.id}`}
                          className="cursor-pointer"
                        ></label>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {plan.is_active
                            ? t(
                                'workoutPlansManager.deactivatePlanTooltip',
                                'Deactivate Plan'
                              )
                            : t(
                                'workoutPlansManager.activatePlanTooltip',
                                'Activate Plan'
                              )}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddWorkoutPlanDialog
        isOpen={isAddPlanDialogOpen}
        onClose={() => setIsAddPlanDialogOpen(false)}
        onSave={handleCreatePlan}
        initialData={null}
      />

      <AddWorkoutPlanDialog
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setSelectedPlan(null);
        }}
        onSave={handleCreatePlan} // This won't be used for editing, but required by prop type
        initialData={selectedPlan}
        onUpdate={handleUpdatePlan}
      />
    </>
  );
};

export default WorkoutPlansManager;
