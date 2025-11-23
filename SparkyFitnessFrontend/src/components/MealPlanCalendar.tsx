import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext'; // Import usePreferences
import { debug, info } from '@/utils/logging'; // Import logging functions
import { toast } from '@/hooks/use-toast';
import { MealPlanTemplate } from '@/types/meal';
import { getMealPlanTemplates, createMealPlanTemplate, updateMealPlanTemplate, deleteMealPlanTemplate } from '@/services/mealPlanTemplateService';
import MealPlanTemplateForm from './MealPlanTemplateForm';
import { Edit, Trash2 } from 'lucide-react';

const MealPlanCalendar: React.FC = () => {
    const { t } = useTranslation();
    const { activeUserId } = useActiveUser();
    const { loggingLevel } = usePreferences(); // Get loggingLevel from preferences
    const [templates, setTemplates] = useState<MealPlanTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<MealPlanTemplate | undefined>(undefined);

    const fetchTemplates = async () => {
        if (!activeUserId) return;
        setIsLoading(true);
        try {
            const fetchedTemplates = await getMealPlanTemplates(activeUserId);
            debug(loggingLevel, 'MealPlanCalendar: Fetched Templates:', fetchedTemplates); // Use debug
            setTemplates(fetchedTemplates.sort((a, b) => a.plan_name.localeCompare(b.plan_name)));
        } catch (error) {
            toast({ title: t('common.error'), description: t('mealPlanCalendar.fetchTemplatesError'), variant: 'destructive' });
            setTemplates([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        info(loggingLevel, 'MealPlanCalendar: Fetching templates for user:', activeUserId); // Use info
        fetchTemplates();
    }, [activeUserId, loggingLevel]); // Add loggingLevel to dependency array

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
                const updatedTemplate = await updateMealPlanTemplate(activeUserId, templateData.id, templateData, currentClientDate);
                debug(loggingLevel, 'MealPlanCalendar: Updating template in state:', updatedTemplate); // Use debug
                setTemplates(prev => prev.map(t => t.id === updatedTemplate.id ? updatedTemplate : t));
                toast({ title: t('common.success'), description: t('mealPlanCalendar.updateSuccess') });
            } else {
                const newTemplate = await createMealPlanTemplate(activeUserId, templateData, currentClientDate);
                debug(loggingLevel, 'MealPlanCalendar: Adding new template to state:', newTemplate); // Use debug
                setTemplates(prev => [...prev, newTemplate]);
                toast({ title: t('common.success'), description: t('mealPlanCalendar.createSuccess') });
            }
            setIsFormOpen(false);
            window.dispatchEvent(new CustomEvent('foodDiaryRefresh'));
            fetchTemplates(); // Refresh the list of templates after saving
        } catch (error) {
            toast({ title: t('common.error'), description: t('mealPlanCalendar.saveTemplateError'), variant: 'destructive' });
        }
    };

    const handleDelete = async (templateId: string) => {
        if (!activeUserId || !window.confirm(t('mealPlanCalendar.deleteTemplateConfirmation'))) return;
        try {
            await deleteMealPlanTemplate(activeUserId, templateId);
            toast({ title: t('common.success'), description: t('mealPlanCalendar.deleteSuccess') });
            fetchTemplates();
        } catch (error) {
            toast({ title: t('common.error'), description: t('mealPlanCalendar.deleteTemplateError'), variant: 'destructive' });
        }
    };

    const handleTogglePlanActive = async (templateId: string, isActive: boolean) => {
        if (!activeUserId) return;
        try {
            const templateToUpdate = templates.find(t => t.id === templateId);
            if (!templateToUpdate) {
                toast({
                    title: t('common.error'),
                    description: t('mealPlanCalendar.updateStatusError'),
                    variant: "destructive",
                });
                return;
            }
            const currentClientDate = new Date().toISOString().split('T')[0];
            await updateMealPlanTemplate(activeUserId, templateId, { ...templateToUpdate, is_active: isActive }, currentClientDate);
            toast({
                title: t('common.success'),
                description: t('mealPlanCalendar.toggleStatusSuccess', { status: isActive ? 'activated' : 'deactivated' }),
            });
            fetchTemplates();
        } catch (error) {
            toast({
                title: t('common.error'),
                description: t('mealPlanCalendar.toggleStatusError'),
                variant: "destructive",
            });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">{t('mealPlanCalendar.title')}</h1>
                <Button onClick={handleCreate}>{t('mealPlanCalendar.createNewPlan')}</Button>
            </div>
            {isLoading ? (
                <p>{t('mealPlanCalendar.loadingTemplates')}</p>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="space-y-2">
                            {templates && templates.length > 0 ? (
                                templates.map(template => (
                                    <div key={template.id} className="flex items-center justify-between p-4 border-b last:border-b-0">
                                        <div>
                                            <p className="font-semibold">{template.plan_name}</p>
                                            <p className="text-sm text-muted-foreground">{template.description}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {new Date(template.start_date).toLocaleDateString()} - {template.end_date ? new Date(template.end_date).toLocaleDateString() : 'Indefinite'}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {t('mealPlanCalendar.weeklyMeals', { count: template.assignments.length })}
                                            </p>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(template)}>
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        <p>{t('mealPlanCalendar.editMealPlan')}</p>
                                                    </TooltipContent>
                                                </Tooltip>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(template.id!)} className="text-red-500 hover:text-red-600">
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
                                                      onCheckedChange={(checked) => handleTogglePlanActive(template.id!, checked)}
                                                    />
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <label htmlFor={`plan-active-${template.id}`} className="cursor-pointer">
                                                         
                                                        </label>
                                                      </TooltipTrigger>
                                                      <TooltipContent>
                                                        <p>{template.is_active ? t('mealPlanCalendar.deactivatePlan') : t('mealPlanCalendar.activatePlan')}</p>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  </div>
                                            </TooltipProvider>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="p-4 text-center text-muted-foreground">{t('mealPlanCalendar.noMealPlansFound')}</p>
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