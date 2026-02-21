import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Bot, Plus } from 'lucide-react';
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
import type {
  AIService,
  UserPreferences,
} from '@/services/aiServiceSettingsService';
import { useTranslation } from 'react-i18next';
import { UserChatPreferences } from '@/components/ai/UserChatPreferences';
import { GlobalOverrideBanner } from '@/components/ai/GlobalOverrideBanner';
import { ServiceForm } from '@/components/ai/ServiceForm';
import { UserServiceListItem } from '@/components/ai/UserServiceListItem';
import { getModelOptions } from '@/utils/aiServiceUtils';
import {
  useAIServices,
  useUserAIPreferences,
  useAddAIService,
  useUpdateAIService,
  useDeleteAIService,
  useUpdateUserAIPreferences,
} from '@/hooks/AI/useAIServiceSettings';
import { useUserAiConfigAllowed } from '@/hooks/AI/useUserAiConfigAllowed';

const AIServiceSettings = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  // TanStack Query hooks
  const { data: isUserConfigAllowed = false, isLoading: settingsLoading } =
    useUserAiConfigAllowed();
  const {
    data: services = [],
    isLoading: servicesLoading,
    refetch: refetchServices,
  } = useAIServices();
  const { data: preferencesData, isLoading: preferencesLoading } =
    useUserAIPreferences();

  // Mutations
  const { mutateAsync: addService, isPending: isAdding } = useAddAIService();
  const { mutateAsync: updateService, isPending: isUpdating } =
    useUpdateAIService();
  const { mutateAsync: deleteService, isPending: isDeleting } =
    useDeleteAIService();
  const { mutateAsync: updatePreferences, isPending: isUpdatingPreferences } =
    useUpdateUserAIPreferences();

  const loading = isAdding || isUpdating || isDeleting || isUpdatingPreferences;

  // Use derived state for preferences, but allow local editing
  // Initialize from query data using lazy initializer
  const defaultPreferences = useMemo(
    () => ({
      auto_clear_history: preferencesData?.auto_clear_history || 'never',
    }),
    [preferencesData?.auto_clear_history]
  );
  const [preferences, setPreferences] =
    useState<UserPreferences>(defaultPreferences);

  // Update local state when server data changes (user hasn't made local changes)
  // This handles the case where preferences are loaded asynchronously
  // We need to sync server data to local state for form editing
  useEffect(() => {
    if (preferencesData?.auto_clear_history) {
      setPreferences((prev) => {
        // Only update if user hasn't changed it locally (still has default)
        if (
          prev.auto_clear_history === 'never' ||
          prev.auto_clear_history === defaultPreferences.auto_clear_history
        ) {
          return {
            auto_clear_history: preferencesData.auto_clear_history,
          };
        }
        return prev;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferencesData?.auto_clear_history]);

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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<string | null>(null);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);

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

    try {
      const overrideData: Partial<AIService> = {
        service_name: `${globalSetting.service_name} (My Override)`,
        service_type: globalSetting.service_type,
        custom_url: globalSetting.custom_url || undefined,
        system_prompt: globalSetting.system_prompt || '',
        is_active: true,
        model_name: globalSetting.model_name || undefined,
      };
      await addService(overrideData);
      // Success toast is handled by the mutation meta
    } catch (error) {
      // Error toast is handled by the mutation meta
      console.error('Error overriding global settings:', error);
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

    try {
      const userSettings = services.filter((s) => !s.is_public);
      // Delete all user settings sequentially
      for (const setting of userSettings) {
        await deleteService(setting.id);
      }
      toast({
        title: t('settings.aiService.userSettings.success'),
        description: t('settings.aiService.userSettings.successReverting'),
      });
      setRevertDialogOpen(false);
    } catch (error) {
      console.error('Error reverting to global settings:', error);
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.errorReverting'),
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
      await addService(serviceData);
      // Reset form
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
      // Success toast is handled by the mutation meta
    } catch (error: unknown) {
      // Check for 403 errors and show appropriate message
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const is403Error =
        errorMessage.includes('403') ||
        errorMessage.includes('disabled') ||
        errorMessage.includes('Per-user AI service configuration is disabled');

      if (is403Error) {
        toast({
          title: t('settings.aiService.userSettings.error'),
          description: t(
            'settings.aiService.userSettings.perUserDisabledDescription'
          ),
          variant: 'destructive',
        });
      }
      // Other errors are handled by the mutation meta
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

    const originalService = services.find((s) => s.id === serviceId);

    if (!originalService) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.errorOriginalNotFound'),
        variant: 'destructive',
      });
      return;
    }

    if (originalService.is_public) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.managedByAdmin'),
        variant: 'destructive',
      });
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
      await updateService({ serviceId, serviceData: serviceToUpdate });
      setEditingService(null);
      setEditData({});
      // Success toast is handled by the mutation meta
    } catch (error: unknown) {
      // Check for 403 errors and show appropriate message
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const is403Error =
        errorMessage.includes('403') ||
        errorMessage.includes('disabled') ||
        errorMessage.includes('Per-user AI service configuration is disabled');

      if (is403Error) {
        toast({
          title: t('settings.aiService.userSettings.error'),
          description: t(
            'settings.aiService.userSettings.perUserDisabledDescription'
          ),
          variant: 'destructive',
        });
      }
      // Other errors are handled by the mutation meta
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

    try {
      await deleteService(serviceToDelete);
      setDeleteDialogOpen(false);
      setServiceToDelete(null);
      // Success toast is handled by the mutation meta
    } catch (error: unknown) {
      // Check for 403 errors and show appropriate message
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const is403Error =
        errorMessage.includes('403') ||
        errorMessage.includes('disabled') ||
        errorMessage.includes('Per-user AI service configuration is disabled');

      if (is403Error) {
        toast({
          title: t('settings.aiService.userSettings.error'),
          description: t(
            'settings.aiService.userSettings.perUserDisabledDescription'
          ),
          variant: 'destructive',
        });
      }
      // Other errors are handled by the mutation meta
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

    const originalService = services.find((s) => s.id === serviceId);

    if (!originalService) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t(
          'settings.aiService.userSettings.errorOriginalNotFoundStatus'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (originalService.is_public) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.managedByAdmin'),
        variant: 'destructive',
      });
      return;
    }

    const serviceToUpdate: Partial<AIService> = {
      ...originalService,
      is_active: isActive,
    };

    try {
      await updateService({ serviceId, serviceData: serviceToUpdate });
      toast({
        title: t('settings.aiService.userSettings.success'),
        description: isActive
          ? t('settings.aiService.userSettings.serviceActivated')
          : t('settings.aiService.userSettings.serviceDeactivated'),
      });
      // Success toast for update is handled by the mutation meta, but we add a specific one for toggle
    } catch (error) {
      // Error toast is handled by the mutation meta
      console.error('Error updating AI service status:', error);
    }
  };

  const handleUpdatePreferences = async () => {
    if (!user) return;

    try {
      await updatePreferences(preferences);
      // Success toast is handled by the mutation meta
    } catch (error) {
      // Error toast is handled by the mutation meta
      console.error('Error updating preferences:', error);
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
                      onEditDataChange={(data) =>
                        setEditData((prev) => ({ ...prev, ...data }))
                      }
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
