import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Bot, Plus, X } from 'lucide-react';
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
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  getAIServices,
  getPreferences,
  addAIService,
  updateAIService,
  deleteAIService,
  updateUserPreferences,
  type AIService,
  type UserPreferences,
} from '@/services/aiServiceSettingsService';
import { globalSettingsService } from '@/api/Admin/globalSettingsService';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserChatPreferences } from '@/components/ai/UserChatPreferences';
import { GlobalOverrideBanner } from '@/components/ai/GlobalOverrideBanner';
import { ServiceForm } from '@/components/ai/ServiceForm';
import { UserServiceListItem } from '@/components/ai/UserServiceListItem';
import { getModelOptions } from '@/utils/aiServiceUtils';

const AIServiceSettings = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  // Check if user AI config is allowed
  const { data: isUserConfigAllowed = false, isLoading: settingsLoading } =
    useQuery<boolean>({
      queryKey: ['userAiConfigAllowed'],
      queryFn: () => globalSettingsService.isUserAiConfigAllowed(),
      retry: false,
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchInterval: 30000,
      refetchIntervalInBackground: false,
    });

  const [services, setServices] = useState<AIService[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>({
    auto_clear_history: 'never',
  });
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
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadServices();
      loadPreferences();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadServices = async () => {
    if (!user) return;

    try {
      const data = await getAIServices();
      setServices(data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error loading AI services:', error);
      toast({
        title: t('settings.aiService.userSettings.error'),
        description:
          error.message || t('settings.aiService.userSettings.errorLoading'),
        variant: 'destructive',
      });
    }
  };

  const hasUserOverride = () => {
    return services.some((s) => !s.is_public && s.is_active);
  };

  const getActiveGlobalSetting = () => {
    return services.find((s) => s.is_public && s.is_active);
  };

  const handleOverrideGlobal = async () => {
    if (settingsLoading) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: 'Please wait while settings are being loaded...',
        variant: 'destructive',
      });
      return;
    }

    if (!isUserConfigAllowed) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t(
          'settings.aiService.userSettings.perUserDisabledDescription'
        ),
        variant: 'destructive',
      });
      return;
    }

    const globalSetting = getActiveGlobalSetting();
    if (!globalSetting) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.errorNoGlobalSetting'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const overrideData: Partial<AIService> = {
        service_name: `${globalSetting.service_name} (My Override)`,
        service_type: globalSetting.service_type,
        custom_url: globalSetting.custom_url || undefined,
        system_prompt: globalSetting.system_prompt || '',
        is_active: true,
        model_name: globalSetting.model_name || undefined,
      };
      await addAIService(overrideData);
      toast({
        title: t('settings.aiService.userSettings.success'),
        description: t('settings.aiService.userSettings.successOverriding'),
      });
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error overriding global settings:', error);
      toast({
        title: t('settings.aiService.userSettings.error'),
        description:
          error.message || t('settings.aiService.userSettings.errorOverriding'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRevertToGlobal = async () => {
    if (settingsLoading) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: 'Please wait while settings are being loaded...',
        variant: 'destructive',
      });
      return;
    }

    if (!isUserConfigAllowed) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t(
          'settings.aiService.userSettings.perUserDisabledDescription'
        ),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const userSettings = services.filter((s) => !s.is_public);
      for (const setting of userSettings) {
        await deleteAIService(setting.id);
      }
      toast({
        title: t('settings.aiService.userSettings.success'),
        description: t('settings.aiService.userSettings.successReverting'),
      });
      loadServices();
      setRevertDialogOpen(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error reverting to global settings:', error);
      toast({
        title: t('settings.aiService.userSettings.error'),
        description:
          error.message || t('settings.aiService.userSettings.errorReverting'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPreferences = async () => {
    if (!user) return;

    try {
      const data = await getPreferences();
      setPreferences({
        auto_clear_history: data.auto_clear_history || 'never',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error loading preferences:', error);
      toast({
        title: t('settings.aiService.userSettings.error'),
        description:
          error.message ||
          t('settings.aiService.userSettings.errorLoadingPreferences'),
        variant: 'destructive',
      });
    }
  };

  const handleAddService = async () => {
    if (settingsLoading) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: 'Please wait while settings are being loaded...',
        variant: 'destructive',
      });
      return;
    }

    if (!isUserConfigAllowed) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t(
          'settings.aiService.userSettings.perUserDisabledDescription'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (
      !user ||
      !newService.service_name ||
      (newService.service_type !== 'ollama' && !newService.api_key)
    ) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.fillRequiredFields'),
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
      await addAIService(serviceData);
      toast({
        title: t('settings.aiService.userSettings.success'),
        description: t('settings.aiService.userSettings.successAdding'),
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
      console.error('Error adding AI service:', error);
      const errorMessage =
        error.message || t('settings.aiService.userSettings.errorAdding');
      const is403Error =
        errorMessage.includes('403') ||
        errorMessage.includes('disabled') ||
        errorMessage.includes('Per-user AI service configuration is disabled');

      toast({
        title: t('settings.aiService.userSettings.error'),
        description: is403Error
          ? t('settings.aiService.userSettings.perUserDisabledDescription')
          : errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateService = async (serviceId: string) => {
    if (settingsLoading) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: 'Please wait while settings are being loaded...',
        variant: 'destructive',
      });
      return;
    }

    if (!isUserConfigAllowed) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t(
          'settings.aiService.userSettings.perUserDisabledDescription'
        ),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    const originalService = services.find((s) => s.id === serviceId);

    if (!originalService) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.errorOriginalNotFound'),
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    if (originalService.is_public) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.managedByAdmin'),
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
      await updateAIService(serviceId, serviceToUpdate);
      toast({
        title: t('settings.aiService.userSettings.success'),
        description: t('settings.aiService.userSettings.successUpdating'),
      });
      setEditingService(null);
      setEditData({});
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error updating AI service:', error);
      const errorMessage =
        error.message || t('settings.aiService.userSettings.errorUpdating');
      const is403Error =
        errorMessage.includes('403') ||
        errorMessage.includes('disabled') ||
        errorMessage.includes('Per-user AI service configuration is disabled');

      toast({
        title: t('settings.aiService.userSettings.error'),
        description: is403Error
          ? t('settings.aiService.userSettings.perUserDisabledDescription')
          : errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteService = async () => {
    if (!serviceToDelete) return;

    if (settingsLoading) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: 'Please wait while settings are being loaded...',
        variant: 'destructive',
      });
      return;
    }

    if (!isUserConfigAllowed) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t(
          'settings.aiService.userSettings.perUserDisabledDescription'
        ),
        variant: 'destructive',
      });
      return;
    }

    const serviceToDeleteObj = services.find((s) => s.id === serviceToDelete);
    if (serviceToDeleteObj?.is_public) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.managedByAdmin'),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await deleteAIService(serviceToDelete);
      toast({
        title: t('settings.aiService.userSettings.success'),
        description: t('settings.aiService.userSettings.successDeleting'),
      });
      loadServices();
      setDeleteDialogOpen(false);
      setServiceToDelete(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error deleting AI service:', error);
      const errorMessage =
        error.message || t('settings.aiService.userSettings.errorDeleting');
      const is403Error =
        errorMessage.includes('403') ||
        errorMessage.includes('disabled') ||
        errorMessage.includes('Per-user AI service configuration is disabled');

      toast({
        title: t('settings.aiService.userSettings.error'),
        description: is403Error
          ? t('settings.aiService.userSettings.perUserDisabledDescription')
          : errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (serviceId: string, isActive: boolean) => {
    if (settingsLoading) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: 'Please wait while settings are being loaded...',
        variant: 'destructive',
      });
      return;
    }

    if (!isUserConfigAllowed) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t(
          'settings.aiService.userSettings.perUserDisabledDescription'
        ),
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    const originalService = services.find((s) => s.id === serviceId);

    if (!originalService) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t(
          'settings.aiService.userSettings.errorOriginalNotFoundStatus'
        ),
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    if (originalService.is_public) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.managedByAdmin'),
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    const serviceToUpdate: Partial<AIService> = {
      ...originalService,
      is_active: isActive,
    };

    try {
      await updateAIService(serviceId, serviceToUpdate);
      toast({
        title: t('settings.aiService.userSettings.success'),
        description: isActive
          ? t('settings.aiService.userSettings.serviceActivated')
          : t('settings.aiService.userSettings.serviceDeactivated'),
      });
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error updating AI service status:', error);
      toast({
        title: t('settings.aiService.userSettings.error'),
        description:
          error.message ||
          t('settings.aiService.userSettings.errorUpdatingStatus'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePreferences = async () => {
    if (!user) return;

    setLoading(true);
    try {
      await updateUserPreferences(preferences);
      toast({
        title: t('settings.aiService.userSettings.success'),
        description: t(
          'settings.aiService.userSettings.successUpdatingPreferences'
        ),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      toast({
        title: t('settings.aiService.userSettings.error'),
        description:
          error.message ||
          t('settings.aiService.userSettings.errorUpdatingPreferences'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (service: AIService) => {
    if (!isUserConfigAllowed) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t(
          'settings.aiService.userSettings.perUserDisabledDescription'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (service.is_public) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.managedByAdmin'),
        variant: 'destructive',
      });
      return;
    }

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

  const openRevertDialog = () => {
    setRevertDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <UserChatPreferences
        preferences={preferences}
        onPreferencesChange={setPreferences}
        onSave={handleUpdatePreferences}
        loading={loading}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {t('settings.aiService.userSettings.title')}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            {t('settings.aiService.userSettings.note')}
          </p>
          <GlobalOverrideBanner
            activeGlobalSetting={getActiveGlobalSetting()}
            hasUserOverride={hasUserOverride()}
            onOverride={handleOverrideGlobal}
            onRevert={openRevertDialog}
            loading={loading}
            isUserConfigAllowed={isUserConfigAllowed}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {isUserConfigAllowed && !showAddForm && (
            <Button onClick={() => setShowAddForm(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.aiService.userSettings.addNewService')}
            </Button>
          )}

          {isUserConfigAllowed && showAddForm && (
            <div className="border rounded-lg p-4">
              <h3 className="text-lg font-medium mb-4">
                {t('settings.aiService.userSettings.addNewService')}
              </h3>
              <ServiceForm
                formData={newService}
                onFormDataChange={(data) =>
                  setNewService((prev) => ({ ...prev, ...data }))
                }
                onSubmit={handleAddService}
                onCancel={() => setShowAddForm(false)}
                loading={loading}
                translationPrefix="settings.aiService.userSettings"
              />
            </div>
          )}

          {services.length > 0 && (
            <>
              <Separator />
              <h3 className="text-lg font-medium">
                {isUserConfigAllowed
                  ? t('settings.aiService.userSettings.configuredServices')
                  : t('settings.aiService.userSettings.availableServices')}
              </h3>

              <div className="space-y-4">
                {services
                  .filter((service) => isUserConfigAllowed || service.is_public)
                  .map((service) => (
                    <UserServiceListItem
                      key={service.id}
                      service={service}
                      isEditing={editingService === service.id}
                      editData={editData}
                      onEditDataChange={setEditData}
                      onStartEdit={() => startEditing(service)}
                      onCancelEdit={cancelEditing}
                      onUpdate={() => handleUpdateService(service.id)}
                      onDelete={() => openDeleteDialog(service.id)}
                      onToggleActive={(isActive) =>
                        handleToggleActive(service.id, isActive)
                      }
                      loading={loading}
                      isUserConfigAllowed={isUserConfigAllowed}
                    />
                  ))}
              </div>
            </>
          )}

          {services.length === 0 && !showAddForm && (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('settings.aiService.userSettings.noServices')}</p>
              {isUserConfigAllowed && (
                <p className="text-sm">
                  {t('settings.aiService.userSettings.noServicesDescription')}
                </p>
              )}
              {!isUserConfigAllowed && (
                <p className="text-sm">
                  {t(
                    'settings.aiService.userSettings.noServicesDescriptionDisabled'
                  )}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.aiService.userSettings.deleteConfirm')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.aiService.userSettings.deleteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setServiceToDelete(null)}>
              {t('settings.aiService.userSettings.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteService}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('settings.aiService.userSettings.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.aiService.userSettings.revertConfirm')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.aiService.userSettings.revertConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRevertDialogOpen(false)}>
              {t('settings.aiService.userSettings.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevertToGlobal}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('settings.aiService.userSettings.useGlobalSettings')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AIServiceSettings;
