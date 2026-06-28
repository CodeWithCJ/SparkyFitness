import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useTranslation } from 'react-i18next';
import { UserChatPreferences } from '@/components/ai/UserChatPreferences';
import { GlobalOverrideBanner } from '@/components/ai/GlobalOverrideBanner';
import { ServiceForm } from '@/components/ai/ServiceForm';
import { UserServiceListItem } from '@/components/ai/UserServiceListItem';
import { getModelOptions, requiresApiKey } from '@/utils/aiServiceUtils';
import {
  useAIServices,
  useActiveAIService,
  useUserAIPreferences,
  useAddAIService,
  useUpdateAIService,
  useDeleteAIService,
  useUpdateUserAIPreferences,
} from '@/hooks/AI/useAIServiceSettings';
import { useUserAiConfigAllowed } from '@/hooks/AI/useUserAiConfigAllowed';
import { useTestAIServiceConnection } from '@/hooks/AI/useTestAIServiceConnection';
import { AiServiceSettingsResponse } from '@workspace/shared';
import {
  CreateAiServiceSettingsFormInput,
  UpdateAiServiceSettingsFormInput,
  createAiServiceSettingsFormSchema,
  updateAiServiceSettingsFormSchema,
} from '@/schemas/form/AiServiceSettings.form.zod';

// Radix Select cannot bind null/'' (an empty SelectItem value throws), so the
// "Same as default" choice maps to this sentinel and back to null on save.
const SAME_AS_DEFAULT = '__default__';

const AIServiceSettings = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  // TanStack Query hooks
  const { data: isUserConfigAllowed = false, isLoading: settingsLoading } =
    useUserAiConfigAllowed();
  const { data: services = [] } = useAIServices();
  const { data: activeService } = useActiveAIService(!!user);
  const { data: preferencesData } = useUserAIPreferences();

  // Services the user has enabled (many can be on). The active-provider
  // dropdown and the global "Active" badge both key off the single selection
  // below, validated against this set so a stale pointer can never win.
  const enabledServices = services.filter((s) => s.is_active);
  const activeServiceId =
    enabledServices.find((s) => s.id === preferencesData?.active_ai_service_id)
      ?.id ??
    enabledServices.find((s) => s.id === activeService?.id)?.id ??
    '';

  // Optional vision override. Validated against enabledServices so a stale or
  // disabled pointer falls back to "Same as default" rather than a dead value.
  const visionServiceId =
    enabledServices.find(
      (s) => s.id === preferencesData?.active_vision_ai_service_id
    )?.id ?? null;

  // Mutations
  const { mutateAsync: addService, isPending: isAdding } = useAddAIService();
  const { mutateAsync: updateService, isPending: isUpdating } =
    useUpdateAIService();
  const { mutateAsync: deleteService, isPending: isDeleting } =
    useDeleteAIService();
  const { mutateAsync: updatePreferences, isPending: isUpdatingPrefs } =
    useUpdateUserAIPreferences();
  const {
    testConnection,
    isPending: isTesting,
    status: testStatus,
    reset: resetTestStatus,
  } = useTestAIServiceConnection();

  const loading = isAdding || isUpdating || isDeleting || isUpdatingPrefs;

  const [newService, setNewService] =
    useState<CreateAiServiceSettingsFormInput>({
      service_name: '',
      service_type: 'openai',
      api_key: '',
      custom_url: '',
      system_prompt: '',
      is_active: false,
      model_name: '',
      showCustomModelInput: false,
      custom_model_name: '',
      chat_tool_profile: 'full',
    });

  const [editingService, setEditingService] = useState<string | null>(null);
  const [editData, setEditData] = useState<UpdateAiServiceSettingsFormInput>({
    api_key: '',
    showCustomModelInput: false,
    custom_model_name: '',
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
      const overrideData = {
        service_name: `${globalSetting.service_name} (My Override)`,
        service_type: globalSetting.service_type,
        custom_url: globalSetting.custom_url || undefined,
        system_prompt: globalSetting.system_prompt || '',
        is_active: true,
        model_name: globalSetting.model_name || undefined,
        chat_tool_profile: globalSetting.chat_tool_profile ?? 'full',
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
      (requiresApiKey(newService.service_type) && !newService.api_key)
    ) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.fillRequiredFields'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const serviceData = createAiServiceSettingsFormSchema.parse(newService);
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
        showCustomModelInput: false,
        custom_model_name: '',
        chat_tool_profile: 'full',
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

    const serviceToUpdate = updateAiServiceSettingsFormSchema.parse({
      ...originalService,
      ...editData,
      id: serviceId,
    });

    if (serviceToUpdate.api_key === '') {
      delete serviceToUpdate.api_key;
    }

    try {
      await updateService({ serviceId, serviceData: serviceToUpdate });
      setEditingService(null);
      setEditData({
        showCustomModelInput: false,
        custom_model_name: '',
      });
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

    const isOwner = originalService.user_id === user?.id;

    if (!isOwner) {
      try {
        await updatePreferences({
          active_ai_service_id: isActive ? serviceId : null,
          auto_clear_history: preferencesData?.auto_clear_history || 'never',
        });
        toast({
          title: t('settings.aiService.userSettings.success'),
          description: isActive
            ? t('settings.aiService.userSettings.serviceActivated')
            : t('settings.aiService.userSettings.serviceDeactivated'),
        });
        return;
      } catch (error) {
        console.error('Error updating active AI service preference:', error);
        return;
      }
    }

    if (originalService.is_public) {
      toast({
        title: t('settings.aiService.userSettings.error'),
        description: t('settings.aiService.userSettings.managedByAdmin'),
        variant: 'destructive',
      });
      return;
    }

    try {
      const serviceData = updateAiServiceSettingsFormSchema.parse({
        service_name: originalService.service_name,
        service_type: originalService.service_type,
        api_key: '',
        custom_url: originalService.custom_url ?? '',
        system_prompt: originalService.system_prompt ?? '',
        is_active: isActive,
        model_name: originalService.model_name ?? '',
        showCustomModelInput: false,
        custom_model_name: '',
      });
      if (serviceData.api_key === '') delete serviceData.api_key;
      await updateService({ serviceId, serviceData });
      toast({
        title: t('settings.aiService.userSettings.success'),
        description: isActive
          ? t('settings.aiService.userSettings.serviceActivated')
          : t('settings.aiService.userSettings.serviceDeactivated'),
      });
    } catch (error) {
      console.error('Error updating AI service status:', error);
    }
  };

  const startEditing = (service: AiServiceSettingsResponse) => {
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

    // Clear any prior service's test result so it never lingers on this form.
    resetTestStatus();
    setEditingService(service.id ?? null);
    const isCustomModel = service.model_name
      ? !getModelOptions(service.service_type ?? '').includes(
          service.model_name
        )
      : false;
    setEditData({
      service_name: service.service_name,
      service_type: service.service_type,
      api_key: '',
      custom_url: service.custom_url,
      system_prompt: service.system_prompt || '',
      is_active: service.is_active,
      model_name: isCustomModel ? '' : service.model_name || '',
      showCustomModelInput: isCustomModel,
      custom_model_name: service.model_name ?? '',
      chat_tool_profile: service.chat_tool_profile ?? 'full',
    });
  };

  const cancelEditing = () => {
    resetTestStatus();
    setEditingService(null);
    setEditData({
      showCustomModelInput: false,
      custom_model_name: '',
    });
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
        key={preferencesData?.auto_clear_history ?? 'inital'}
        defaultPreferences={{
          auto_clear_history: preferencesData?.auto_clear_history || 'never',
        }}
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
            <Button
              onClick={() => {
                resetTestStatus();
                setShowAddForm(true);
              }}
              variant="outline"
            >
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
                onCancel={() => {
                  resetTestStatus();
                  setShowAddForm(false);
                }}
                loading={loading}
                translationPrefix="settings.aiService.userSettings"
                onTestConnection={(model) =>
                  testConnection({
                    service_type: newService.service_type,
                    api_key: newService.api_key,
                    custom_url: newService.custom_url ?? undefined,
                    model_name: model,
                  })
                }
                testing={isTesting}
                testStatus={testStatus}
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

              {/* Active-provider + vision-provider selectors share a row.
                  active_ai_service_id is the single pointer every AI feature
                  (chat, food-photo, label scan, unit conversion) reads;
                  active_vision_ai_service_id optionally overrides it for the
                  vision tasks (food-photo + label scan, and chat's image tools),
                  falling back to the active provider. "Same as default" clears it. */}
              {enabledServices.length > 0 && (
                <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
                  <div className="space-y-2 sm:max-w-sm sm:flex-1">
                    <Label htmlFor="active-ai-provider-select">
                      {t(
                        'settings.aiService.userSettings.activeProvider',
                        'Active AI provider'
                      )}
                    </Label>
                    <Select
                      value={activeServiceId}
                      onValueChange={(id) =>
                        updatePreferences({
                          active_ai_service_id: id,
                          auto_clear_history:
                            preferencesData?.auto_clear_history || 'never',
                        })
                      }
                    >
                      <SelectTrigger
                        id="active-ai-provider-select"
                        className="w-full"
                      >
                        <SelectValue
                          placeholder={t(
                            'settings.aiService.userSettings.activeProvider',
                            'Active AI provider'
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {enabledServices.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.service_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 sm:max-w-sm sm:flex-1">
                    <Label htmlFor="active-vision-ai-provider-select">
                      {t(
                        'settings.aiService.userSettings.activeVisionProvider',
                        'Active vision AI provider'
                      )}
                    </Label>
                    <Select
                      value={visionServiceId ?? SAME_AS_DEFAULT}
                      onValueChange={(v) =>
                        updatePreferences({
                          active_vision_ai_service_id:
                            v === SAME_AS_DEFAULT ? null : v,
                          auto_clear_history:
                            preferencesData?.auto_clear_history || 'never',
                        })
                      }
                    >
                      <SelectTrigger
                        id="active-vision-ai-provider-select"
                        className="w-full"
                      >
                        <SelectValue
                          placeholder={t(
                            'settings.aiService.userSettings.activeVisionProvider',
                            'Active vision AI provider'
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SAME_AS_DEFAULT}>
                          {t(
                            'settings.aiService.userSettings.sameAsDefault',
                            'Same as default'
                          )}
                        </SelectItem>
                        {enabledServices.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            {service.service_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {services
                  .filter((service) => isUserConfigAllowed || service.is_public)
                  .map((service) => {
                    const isOwner = service.user_id === user?.id;

                    return (
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
                        isOwner={isOwner}
                        isActiveProvider={service.id === activeServiceId}
                        onTestConnection={(model) =>
                          testConnection({
                            id: service.id,
                            service_type:
                              editData.service_type || service.service_type,
                            api_key: editData.api_key,
                            custom_url: editData.custom_url ?? undefined,
                            model_name: model,
                          })
                        }
                        testing={isTesting}
                        testStatus={testStatus}
                      />
                    );
                  })}
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
