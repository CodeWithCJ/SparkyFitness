import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug } from '@/utils/logging';
import { toast } from '@/hooks/use-toast';
import type { MealPlanTemplate } from '@/types/meal';
import MealPlanTemplateForm from './MealPlanTemplateForm';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useCreateMealPlanMutation,
  useDeleteMealPlanMutation,
  useMealPlanTemplates,
  useUpdateMealPlanMutation,
} from '@/hooks/Foods/useMealplanTemplate';

const MealPlanCalendar: React.FC = () => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const { loggingLevel } = usePreferences(); // Get loggingLevel from preferences
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<
    MealPlanTemplate | undefined
  >(undefined);
  const isMobile = useIsMobile();
  const { data: templates, isLoading } = useMealPlanTemplates(activeUserId);
  const { mutateAsync: createMealPlanTemplate } = useCreateMealPlanMutation();
  const { mutateAsync: updateMealPlanTemplate } = useUpdateMealPlanMutation();
  const { mutateAsync: deleteMealPlanTemplate } = useDeleteMealPlanMutation();

  const handleCreate = () => {
    setSelectedTemplate(undefined);
    setIsFormOpen(true);
  };

  const handleEdit = (template: MealPlanTemplate) => {
    setSelectedTemplate(template);
    setIsFormOpen(true);
  };

  const handleSave = async (templateData: Partial<MealPlanTemplate>) => {
    if (!activeUserId) return;
    try {
      const currentClientDate = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format

      if (templateData.id) {
        const updatedTemplate = await updateMealPlanTemplate({
          userId: activeUserId,
          templateData,
          currentClientDate,
        });
        debug(
          loggingLevel,
          'MealPlanCalendar: Updating template in state:',
          updatedTemplate
        ); // Use debug
      } else {
        const newTemplate = await createMealPlanTemplate({
          userId: activeUserId,
          templateData,
          currentClientDate,
        });
        debug(
          loggingLevel,
          'MealPlanCalendar: Adding new template to state:',
          newTemplate
        ); // Use debug
      }
      setIsFormOpen(false);
      window.dispatchEvent(new CustomEvent('foodDiaryRefresh'));
    } catch (error) {
      // The toast will be handled by the QueryClient's mutationCache
    }
  };

  const handleDelete = async (templateId: string) => {
    if (
      !activeUserId ||
      !window.confirm(t('mealPlanCalendar.deleteTemplateConfirmation'))
    )
      return;
    try {
      await deleteMealPlanTemplate({ userId: activeUserId, templateId });
    } catch (error) {
      // The toast will be handled by the QueryClient's mutationCache
    }
  };

  const handleTogglePlanActive = async (
    templateId: string,
    isActive: boolean
  ) => {
    if (!activeUserId) return;
    try {
      const templateToUpdate = templates.find((t) => t.id === templateId);
      if (!templateToUpdate) {
        toast({
          title: t('common.error'),
          description: t('mealPlanCalendar.updateStatusError'),
          variant: 'destructive',
        });
        return;
      }
      const currentClientDate = new Date().toISOString().split('T')[0];

      await updateMealPlanTemplate({
        userId: activeUserId,
        templateData: { ...templateToUpdate, is_active: isActive },
        currentClientDate,
      });
    } catch (error) {
      // The toast will be handled by the QueryClient's mutationCache
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-2 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight ml-3">
          {t('mealPlanCalendar.title')}
        </h1>
        <Button
          onClick={handleCreate}
          size={isMobile ? 'icon' : 'default'}
          className="shrink-0 mr-6"
          title={t('mealPlanCalendar.createNewPlan')}
        >
          <Plus className={isMobile ? 'h-5 w-5' : 'h-4 w-4 mr-2'} />
          {!isMobile && <span>{t('mealPlanCalendar.createNewPlan')}</span>}
        </Button>
      </div>
      {isLoading ? (
        <p>{t('mealPlanCalendar.loadingTemplates')}</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="space-y-2">
              {templates && templates.length > 0 ? (
                templates.map((template) => (
                  <div
                    key={template.id}
                    className="flex items-center justify-between p-4 border-b last:border-b-0"
                  >
                    <div>
                      <p className="font-semibold">{template.plan_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(template.start_date).toLocaleDateString()} -{' '}
                        {template.end_date
                          ? new Date(template.end_date).toLocaleDateString()
                          : 'Indefinite'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('mealPlanCalendar.weeklyMeals', {
                          count: template.assignments.length,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(template)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('mealPlanCalendar.editMealPlan')}</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(template.id!)}
                              className="text-red-500 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('mealPlanCalendar.deleteMealPlan')}</p>
                          </TooltipContent>
                        </Tooltip>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id={`plan-active-${template.id}`}
                            checked={template.is_active}
                            onCheckedChange={(checked) =>
                              handleTogglePlanActive(template.id!, checked)
                            }
                          />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <label
                                htmlFor={`plan-active-${template.id}`}
                                className="cursor-pointer"
                              ></label>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {template.is_active
                                  ? t('mealPlanCalendar.deactivatePlan')
                                  : t('mealPlanCalendar.activatePlan')}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-4 text-center text-muted-foreground">
                  {t('mealPlanCalendar.noMealPlansFound')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isFormOpen && (
        <MealPlanTemplateForm
          template={selectedTemplate}
          onSave={handleSave}
          onClose={() => setIsFormOpen(false)}
        />
      )}
    </div>
  );
};

export default MealPlanCalendar;
