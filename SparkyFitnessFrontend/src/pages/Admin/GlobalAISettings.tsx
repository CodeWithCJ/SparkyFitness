import { useState, useEffect, useCallback } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Globe } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  getGlobalAIServices,
  createGlobalAIService,
  updateGlobalAIService,
  deleteGlobalAIService,
  type AIService,
} from '@/services/aiServiceSettingsService';
import { useSettings, useUpdateSettings } from '@/hooks/Admin/useSettings';
import { type GlobalSettings } from '@/api/Admin/globalSettingsService';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { ServiceForm } from '@/components/ai/ServiceForm';
import { ServiceList } from '@/components/ai/ServiceList';
import { getModelOptions } from '@/utils/aiServiceUtils';

const GlobalAISettings = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: globalSettings, isLoading: settingsLoading } = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const [services, setServices] = useState<AIService[]>([]);
  const [newService, setNewService] = useState({
    service_name: '',
    service_type: 'openai',
    api_key: '',
    custom_url: '',
    system_prompt: '',
    is_active: false,
    model_name: '',
    custom_model_name: '',
    showCustomModelInput: false,
  });
  const [editingService, setEditingService] = useState<string | null>(null);
  const [editData, setEditData] = useState<
    Partial<AIService & { showCustomModelInput?: boolean; api_key?: string }>
  >({
    api_key: '',
    custom_model_name: '',
    showCustomModelInput: false,
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);

  const loadServices = useCallback(async () => {
    try {
      const data = await getGlobalAIServices();
      setServices(data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error loading global AI services:', error);
      toast({
        title: t('settings.aiService.globalSettings.error'),
        description:
          error.message || t('settings.aiService.globalSettings.errorLoading'),
        variant: 'destructive',
      });
    }
  }, [toast, t]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const handleAllowUserConfigChange = (checked: boolean) => {
    if (!globalSettings) return;

    const newSettings: GlobalSettings = {
      ...globalSettings,
      allow_user_ai_config: checked,
    };

    updateSettings(newSettings, {
      onSuccess: () => {
        // Invalidate the userAiConfigAllowed query so all users see the updated setting
        queryClient.invalidateQueries({ queryKey: ['userAiConfigAllowed'] });
        toast({
          title: t('settings.aiService.globalSettings.success'),
          description: t(
            'settings.aiService.globalSettings.successUpdatingConfig'
          ),
        });
      },
      onError: () => {
        toast({
          title: t('settings.aiService.globalSettings.error'),
          description: t(
            'settings.aiService.globalSettings.errorUpdatingConfig'
          ),
          variant: 'destructive',
        });
      },
    });
  };

  const handleAddService = async () => {
    if (
      !newService.service_name ||
      (newService.service_type !== 'ollama' && !newService.api_key)
    ) {
      toast({
        title: t('settings.aiService.globalSettings.error'),
        description: t('settings.aiService.globalSettings.fillRequiredFields'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const serviceData = {
        service_name: newService.service_name,
        service_type: newService.service_type,
        api_key: newService.api_key,
        custom_url: newService.custom_url || null,
        system_prompt: newService.system_prompt || '',
        is_active: newService.is_active,
        model_name: newService.showCustomModelInput
          ? newService.custom_model_name
          : newService.model_name || null,
      };
      await createGlobalAIService(serviceData);
      toast({
        title: t('settings.aiService.globalSettings.success'),
        description: t('settings.aiService.globalSettings.successAdding'),
      });
      setNewService({
        service_name: '',
        service_type: 'openai',
        api_key: '',
        custom_url: '',
        system_prompt: '',
        is_active: false,
        model_name: '',
        custom_model_name: '',
        showCustomModelInput: false,
      });
      setShowAddForm(false);
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error adding global AI service:', error);
      toast({
        title: t('settings.aiService.globalSettings.error'),
        description:
          error.message || t('settings.aiService.globalSettings.errorAdding'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateService = async (serviceId: string) => {
    setLoading(true);
    const originalService = services.find((s) => s.id === serviceId);

    if (!originalService) {
      toast({
        title: t('settings.aiService.globalSettings.error'),
        description: t(
          'settings.aiService.globalSettings.errorOriginalNotFound'
        ),
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    const serviceToUpdate: Partial<AIService> = {
      ...originalService,
      ...editData,
      id: serviceId,
      model_name: editData.showCustomModelInput
        ? editData.custom_model_name
        : editData.model_name || null,
    };

    if (serviceToUpdate.api_key === '') {
      delete serviceToUpdate.api_key;
    }

    try {
      await updateGlobalAIService(serviceId, serviceToUpdate);
      toast({
        title: t('settings.aiService.globalSettings.success'),
        description: t('settings.aiService.globalSettings.successUpdating'),
      });
      setEditingService(null);
      setEditData({});
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error updating global AI service:', error);
      toast({
        title: t('settings.aiService.globalSettings.error'),
        description:
          error.message || t('settings.aiService.globalSettings.errorUpdating'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteService = async () => {
    if (!serviceToDelete) return;

    setLoading(true);
    try {
      await deleteGlobalAIService(serviceToDelete);
      toast({
        title: t('settings.aiService.globalSettings.success'),
        description: t('settings.aiService.globalSettings.successDeleting'),
      });
      loadServices();
      setDeleteDialogOpen(false);
      setServiceToDelete(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error deleting global AI service:', error);
      toast({
        title: t('settings.aiService.globalSettings.error'),
        description:
          error.message || t('settings.aiService.globalSettings.errorDeleting'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (service: AIService) => {
    setEditingService(service.id);
    setEditData({
      service_name: service.service_name,
      service_type: service.service_type,
      api_key: '',
      custom_url: service.custom_url,
      system_prompt: service.system_prompt || '',
      is_active: service.is_active,
      model_name: service.model_name || '',
      custom_model_name: service.model_name || '',
      showCustomModelInput: service.model_name
        ? !getModelOptions(service.service_type).includes(service.model_name)
        : false,
    });
  };

  const cancelEditing = () => {
    setEditingService(null);
    setEditData({});
  };

  const openDeleteDialog = (serviceId: string) => {
    setServiceToDelete(serviceId);
    setDeleteDialogOpen(true);
  };

  return (
    <Accordion type="multiple" className="w-full">
      <AccordionItem value="global-ai-settings" className="border rounded-lg">
        <AccordionTrigger
          className="flex items-center gap-2 p-4 hover:no-underline"
          description={t('settings.aiService.globalSettings.description')}
        >
          <Globe className="h-5 w-5" />
          {t('settings.aiService.globalSettings.title')}
        </AccordionTrigger>
        <AccordionContent className="p-4 pt-0 space-y-4">
          {/* User AI Config Toggle */}
          {globalSettings && (
            <div className="flex items-center justify-between p-4 border rounded-md mb-4">
              <div className="flex-1">
                <Label htmlFor="allow_user_ai_config" className="font-medium">
                  {t('settings.aiService.globalSettings.allowUserConfig')}
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {t(
                    'settings.aiService.globalSettings.allowUserConfigDescription'
                  )}
                </p>
              </div>
              <Switch
                id="allow_user_ai_config"
                checked={globalSettings.allow_user_ai_config !== false}
                onCheckedChange={handleAllowUserConfigChange}
                disabled={settingsLoading}
              />
            </div>
          )}

          {!showAddForm && (
            <Button onClick={() => setShowAddForm(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.aiService.globalSettings.addNewService')}
            </Button>
          )}

          {showAddForm && (
            <div className="border rounded-lg p-4">
              <h3 className="text-lg font-medium mb-4">
                {t('settings.aiService.globalSettings.addNewService')}
              </h3>
              <ServiceForm
                formData={newService}
                onFormDataChange={(data) =>
                  setNewService((prev) => ({ ...prev, ...data }))
                }
                onSubmit={handleAddService}
                onCancel={() => setShowAddForm(false)}
                loading={loading}
                translationPrefix="settings.aiService.globalSettings"
              />
            </div>
          )}

          <ServiceList
            services={services}
            editingService={editingService}
            editData={editData}
            onEditDataChange={setEditData}
            onStartEdit={startEditing}
            onCancelEdit={cancelEditing}
            onUpdate={handleUpdateService}
            onDelete={openDeleteDialog}
            loading={loading}
            translationPrefix="settings.aiService.globalSettings"
            showGlobalBadge={true}
          />

          {services.length === 0 && !showAddForm && (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('settings.aiService.globalSettings.noServices')}</p>
              <p className="text-sm">
                {t('settings.aiService.globalSettings.noServicesDescription')}
              </p>
            </div>
          )}

          <AlertDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('settings.aiService.globalSettings.deleteConfirm')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('settings.aiService.globalSettings.deleteConfirm')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setServiceToDelete(null)}>
                  {t('settings.aiService.globalSettings.cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteService}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('settings.aiService.globalSettings.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default GlobalAISettings;
