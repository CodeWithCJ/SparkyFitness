import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  Plus,
  Edit,
  Trash2,
  CalendarDays,
  Activity,
  Clock,
} from 'lucide-react';
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

  const { data: plans } = useWorkoutPlanTemplates(user?.id);
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
      const planToUpdate = plans?.find((p) => p.id === planId);
      if (!planToUpdate) {
        toast({
          title: t('common.error'),
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
        data: { ...planToUpdate, is_active: isActive },
      });
    } catch (err) {
      error(loggingLevel, 'Error toggling workout plan active status:', err);
    }
  };

  if (!plans) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-end px-1">
        <Button
          onClick={() => setIsAddPlanDialogOpen(true)}
          className="rounded-xl shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t('workoutPlansManager.addPlanButton', 'Add Plan')}
        </Button>
      </div>

      {plans.length === 0 ? (
        <p className="text-center text-gray-400 py-10 italic">
          {t(
            'workoutPlansManager.noPlansFound',
            'No workout plans found. Create one to get started!'
          )}
        </p>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <WorkoutPlanItem
              key={plan.id}
              plan={plan}
              onEdit={() => {
                setSelectedPlan(plan);
                setIsEditDialogOpen(true);
              }}
              onDelete={() => handleDeletePlan(plan.id)}
              onToggleActive={(active) =>
                handleTogglePlanActive(plan.id, active)
              }
            />
          ))}
        </div>
      )}

      <AddWorkoutPlanDialog
        key={`add-${isAddPlanDialogOpen ? 'open' : 'closed'}`}
        isOpen={isAddPlanDialogOpen}
        onClose={() => setIsAddPlanDialogOpen(false)}
        onSave={handleCreatePlan}
        initialData={null}
      />

      <AddWorkoutPlanDialog
        key={`edit-${selectedPlan?.id ?? (isEditDialogOpen ? 'open' : 'closed')}`}
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setSelectedPlan(null);
        }}
        onSave={handleCreatePlan}
        initialData={selectedPlan}
        onUpdate={handleUpdatePlan}
      />
    </div>
  );
};

const WorkoutPlanItem: React.FC<{
  plan: WorkoutPlanTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (active: boolean) => void;
}> = ({ plan, onEdit, onDelete, onToggleActive }) => {
  const { t } = useTranslation();

  return (
    <Card className="overflow-hidden border-0 shadow-md bg-white dark:bg-gray-900 rounded-xl">
      <div className="flex">
        {/* Left accent stripe - color changes based on active status */}
        <div
          className={`w-1 flex-shrink-0 rounded-l-xl transition-colors duration-300 ${
            plan.is_active
              ? 'bg-gradient-to-b from-emerald-500 to-teal-600'
              : 'bg-gradient-to-b from-gray-400 to-gray-500'
          }`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-semibold text-gray-900 dark:text-gray-50 text-base leading-tight truncate">
                  {plan.plan_name}
                </span>
                <span
                  className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                    plan.is_active
                      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  {plan.is_active
                    ? t('workoutPlansManager.activeStatus').toUpperCase()
                    : t('workoutPlansManager.inactiveStatus').toUpperCase()}
                </span>
              </div>

              {plan.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mb-2">
                  {plan.description}
                </p>
              )}

              <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  <span>{new Date(plan.start_date!).toLocaleDateString()}</span>
                  <span>-</span>
                  <span>
                    {plan.end_date
                      ? new Date(plan.end_date).toLocaleDateString()
                      : t('workoutPlansManager.ongoingStatus', 'Ongoing')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center px-2">
                      <Switch
                        id={`plan-active-${plan.id}`}
                        checked={plan.is_active}
                        onCheckedChange={onToggleActive}
                        className="scale-75"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {plan.is_active
                        ? t('workoutPlansManager.deactivatePlanTooltip')
                        : t('workoutPlansManager.activatePlanTooltip')}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <ActionButton
                icon={<Edit className="h-3.5 w-3.5" />}
                label={t('workoutPlansManager.editPlanTooltip')}
                onClick={onEdit}
                colorClass="hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
              />
              <ActionButton
                icon={<Trash2 className="h-3.5 w-3.5" />}
                label={t('workoutPlansManager.deletePlanTooltip')}
                onClick={onDelete}
                colorClass="hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
              />
            </div>
          </div>

          {/* Stats strip for a Plan */}
          <div className="mx-4 mb-4 mt-1 grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-800 bg-gray-50 dark:bg-gray-800/60 rounded-lg overflow-hidden">
            <StatCell
              icon={<Activity className="w-3 h-3" />}
              value={plan.is_active ? 'LIVE' : 'IDLE'}
              label="Status"
              color={
                plan.is_active
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-gray-400'
              }
            />
            <StatCell
              icon={<Clock className="w-3 h-3" />}
              value={
                plan.end_date
                  ? new Date(plan.end_date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })
                  : '∞'
              }
              label="End Date"
              color="text-blue-600 dark:text-blue-400"
            />
          </div>
        </div>
      </div>
    </Card>
  );
};

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  colorClass: string;
}> = ({ icon, label, onClick, colorClass }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          className={`h-8 w-8 text-gray-400 transition-colors ${colorClass}`}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const StatCell: React.FC<{
  icon: React.ReactNode;
  value: string;
  label: string;
  color: string;
}> = ({ icon, value, label, color }) => (
  <div className="flex flex-col items-center justify-center py-2 px-1 gap-0.5">
    <span className={`${color} flex items-center gap-1`}>
      {icon}
      <span className="font-bold text-xs text-gray-800 dark:text-gray-100 uppercase tracking-tighter">
        {value}
      </span>
    </span>
    <span className="text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-bold">
      {label}
    </span>
  </div>
);

export default WorkoutPlansManager;
