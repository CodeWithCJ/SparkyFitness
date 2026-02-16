import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTranslation } from 'react-i18next';
import { useWeeklyGoalPlans } from '@/hooks/Goals/useGoals';
import { WeeklyGoalPlan } from '@/api/Goals/goals';
interface WeeklyGoalPlansSectionProps {
  handleCreateWeeklyPlanClick: () => void;
  handleEditWeeklyPlanClick: (plan: WeeklyGoalPlan) => void;
  handleDeleteWeeklyPlan: (planId: string) => void;
}
export const WeeklyGoalPlansSection = ({
  handleCreateWeeklyPlanClick,
  handleDeleteWeeklyPlan,
  handleEditWeeklyPlanClick,
}: WeeklyGoalPlansSectionProps) => {
  const { formatDateInUserTimezone } = usePreferences();
  const { t } = useTranslation();

  const { data: weeklyPlans = [] } = useWeeklyGoalPlans();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold">
          {t('goals.goalsSettings.weeklyGoalPlans', 'Weekly Goal Plans (WIP)')}
        </CardTitle>
        <Button size="sm" onClick={handleCreateWeeklyPlanClick}>
          <PlusCircle className="w-4 h-4 mr-2" />{' '}
          {t('goals.goalsSettings.createNewPlan', 'Create New Plan')}
        </Button>
      </CardHeader>
      <CardContent>
        {weeklyPlans.length === 0 ? (
          <p className="text-gray-500">
            {t(
              'goals.goalsSettings.noWeeklyPlans',
              'No weekly goal plans defined yet. Create one to automate your goals!'
            )}
          </p>
        ) : (
          <div className="space-y-4">
            {weeklyPlans.map((plan) => (
              <div
                key={plan.id}
                className="flex items-center justify-between p-3 border rounded-md"
              >
                <div>
                  <h4 className="font-semibold">
                    {plan.plan_name}{' '}
                    {plan.is_active && (
                      <Badge variant="secondary">
                        {t('goals.goalsSettings.active', 'Active')}
                      </Badge>
                    )}
                  </h4>
                  <p className="text-sm text-gray-600">
                    {formatDateInUserTimezone(plan.start_date)} to{' '}
                    {plan.end_date
                      ? formatDateInUserTimezone(plan.end_date)
                      : t('common.indefinite', 'Indefinite')}
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditWeeklyPlanClick(plan)}
                  >
                    <Edit className="w-4 h-4" />{' '}
                    {t('goals.goalsSettings.edit', 'Edit')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => plan.id && handleDeleteWeeklyPlan(plan.id)}
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
