import { useState, useEffect, useCallback } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Bot,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getGlobalAIServices,
  createGlobalAIService,
  updateGlobalAIService,
  deleteGlobalAIService,
  syncGlobalSettingsFromEnv,
  type AIService,
} from '@/services/aiServiceSettingsService';
import { useSettings, useUpdateSettings } from '@/hooks/Admin/useSettings';
import { type GlobalSettings } from '@/api/Admin/globalSettingsService';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

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

  const loadServices = useCallback(async () => {
    try {
      const data = await getGlobalAIServices();
      setServices(data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error loading global AI services:', error);
      toast({
        title: t('settings.aiService.globalSettings.error'),
        description: error.message || t('settings.aiService.globalSettings.errorLoading'),
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const handleAllowUserConfigChange = (checked: boolean) => {
    if (!globalSettings) return;

    const newSettings: GlobalSettings = { ...globalSettings, allow_user_ai_config: checked };

    updateSettings(newSettings, {
      onSuccess: () => {
        // Invalidate the userAiConfigAllowed query so all users see the updated setting
        queryClient.invalidateQueries({ queryKey: ['userAiConfigAllowed'] });
        toast({
          title: t('settings.aiService.globalSettings.success'),
          description: t('settings.aiService.globalSettings.successUpdatingConfig'),
        });
      },
      onError: () => {
        toast({
          title: t('settings.aiService.globalSettings.error'),
          description: t('settings.aiService.globalSettings.errorUpdatingConfig'),
          variant: 'destructive',
        });
      },
    });
  };

  // Note: We can't check process.env in the browser, so we'll rely on the backend
  // to indicate if it's env-controlled. For now, we'll just show the toggle.
  // The backend will ignore updates if env var is set.

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
        description: error.message || t('settings.aiService.globalSettings.errorAdding'),
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
        description: t('settings.aiService.globalSettings.errorOriginalNotFound'),
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
        description: error.message || t('settings.aiService.globalSettings.errorUpdating'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    if (!confirm(t('settings.aiService.globalSettings.deleteConfirm')))
      return;

    setLoading(true);
    try {
      await deleteGlobalAIService(serviceId);
      toast({
        title: t('settings.aiService.globalSettings.success'),
        description: t('settings.aiService.globalSettings.successDeleting'),
      });
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error deleting global AI service:', error);
      toast({
        title: t('settings.aiService.globalSettings.error'),
        description: error.message || t('settings.aiService.globalSettings.errorDeleting'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncFromEnv = async () => {
    setLoading(true);
    try {
      const result = await syncGlobalSettingsFromEnv();
      toast({
        title: t('settings.aiService.globalSettings.success'),
        description:
          result.message || t('settings.aiService.globalSettings.successSyncing'),
      });
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error syncing from environment variables:', error);
      toast({
        title: t('settings.aiService.globalSettings.error'),
        description:
          error.message || t('settings.aiService.globalSettings.errorSyncing'),
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

  const getServiceTypes = () => [
    { value: 'openai', label: t('settings.aiService.serviceTypes.openai') },
    { value: 'openai_compatible', label: t('settings.aiService.serviceTypes.openaiCompatible') },
    { value: 'anthropic', label: t('settings.aiService.serviceTypes.anthropic') },
    { value: 'google', label: t('settings.aiService.serviceTypes.google') },
    { value: 'mistral', label: t('settings.aiService.serviceTypes.mistral') },
    { value: 'groq', label: t('settings.aiService.serviceTypes.groq') },
    { value: 'ollama', label: t('settings.aiService.serviceTypes.ollama') },
    { value: 'custom', label: t('settings.aiService.serviceTypes.custom') },
  ];

  const getModelOptions = (serviceType: string) => {
    switch (serviceType) {
      case 'openai':
      case 'openai_compatible':
        return [
          'gpt-4o',
          'gpt-4o-mini',
          'gpt-4-turbo',
          'gpt-4',
          'gpt-3.5-turbo',
          'o1-preview',
          'o1-mini',
        ];
      case 'anthropic':
        return [
          'claude-3-5-sonnet-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307',
        ];
      case 'google':
        return [
          'gemini-pro',
          'gemini-pro-vision',
          'gemini-1.5-pro',
          'gemini-1.5-flash',
        ];
      case 'mistral':
        return [
          'mistral-large-latest',
          'mistral-medium-latest',
          'mistral-small-latest',
          'open-mistral-7b',
          'open-mixtral-8x7b',
        ];
      case 'groq':
        return [
          'llama-3.1-8b-instant',
          'llama-3.3-70b-versatile',
          'meta-llama/llama-guard-4-12b',
          'whisper-large-v3',
          'whisper-large-v3-turbo',
        ];
      default:
        return [];
    }
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
                  {t('settings.aiService.globalSettings.allowUserConfigDescription')}
                  <span className="block mt-1 text-xs text-muted-foreground">
                    {t('settings.aiService.globalSettings.allowUserConfigEnvNote')}
                  </span>
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

          <div className="flex justify-end mb-4">
            <Button
              onClick={handleSyncFromEnv}
              variant="outline"
              size="sm"
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('settings.aiService.globalSettings.syncFromEnv')}
            </Button>
          </div>
          {!showAddForm && (
            <Button onClick={() => setShowAddForm(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              {t('settings.aiService.globalSettings.addNewService')}
            </Button>
          )}

          {showAddForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddService();
              }}
              className="border rounded-lg p-4 space-y-4"
            >
              <h3 className="text-lg font-medium">{t('settings.aiService.globalSettings.addNewService')}</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="new_service_name">{t('settings.aiService.globalSettings.serviceName')}</Label>
                  <Input
                    id="new_service_name"
                    value={newService.service_name}
                    onChange={(e) =>
                      setNewService((prev) => ({
                        ...prev,
                        service_name: e.target.value,
                      }))
                    }
                    placeholder={t('settings.aiService.globalSettings.serviceNamePlaceholder')}
                    autoComplete="username"
                  />
                </div>
                <div>
                  <Label htmlFor="new_service_type">{t('settings.aiService.globalSettings.serviceType')}</Label>
                  <Select
                    value={newService.service_type}
                    onValueChange={(value) =>
                      setNewService((prev) => ({
                        ...prev,
                        service_type: value,
                        model_name: '',
                      }))
                    }
                  >
                    <SelectTrigger id="new_service_type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getServiceTypes().map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="new_api_key">
                  {newService.service_type === 'ollama'
                    ? t('settings.aiService.globalSettings.apiKeyOptional')
                    : t('settings.aiService.globalSettings.apiKey')}
                </Label>
                <Input
                  id="new_api_key"
                  type="password"
                  value={newService.api_key}
                  onChange={(e) =>
                    setNewService((prev) => ({
                      ...prev,
                      api_key: e.target.value,
                    }))
                  }
                  placeholder={
                    newService.service_type === 'ollama'
                      ? t('settings.aiService.globalSettings.apiKeyPlaceholderOllama')
                      : t('settings.aiService.globalSettings.apiKeyPlaceholder')
                  }
                  autoComplete="new-password"
                />
              </div>

                {(newService.service_type === 'custom' ||
                newService.service_type === 'ollama' ||
                newService.service_type === 'openai_compatible') && (
                  <div>
                    <Label htmlFor="new_custom_url">{t('settings.aiService.globalSettings.customUrl')}</Label>
                    <Input
                      id="new_custom_url"
                      value={newService.custom_url}
                      onChange={(e) =>
                        setNewService((prev) => ({
                          ...prev,
                          custom_url: e.target.value,
                        }))
                      }
                      placeholder={
                        newService.service_type === 'ollama'
                          ? t('settings.aiService.globalSettings.customUrlPlaceholderOllama')
                          : t('settings.aiService.globalSettings.customUrlPlaceholder')
                      }
                    />
                  </div>
                )}

              <div className="flex items-center space-x-2 mb-4">
                <Switch
                  id="new_use_custom_model"
                  checked={newService.showCustomModelInput}
                  onCheckedChange={(checked) =>
                    setNewService((prev) => ({
                      ...prev,
                      showCustomModelInput: checked,
                      model_name: '',
                      custom_model_name: '',
                    }))
                  }
                />
                <Label htmlFor="new_use_custom_model">
                  {t('settings.aiService.globalSettings.useCustomModel')}
                </Label>
              </div>

              {!newService.showCustomModelInput &&
                getModelOptions(newService.service_type).length > 0 && (
                  <div>
                    <Label htmlFor="new_model_name_select">{t('settings.aiService.globalSettings.model')}</Label>
                    <Select
                      value={newService.model_name}
                      onValueChange={(value) =>
                        setNewService((prev) => ({
                          ...prev,
                          model_name: value,
                        }))
                      }
                    >
                      <SelectTrigger id="new_model_name_select">
                        <SelectValue placeholder={t('settings.aiService.globalSettings.selectModel')} />
                      </SelectTrigger>
                      <SelectContent>
                        {getModelOptions(newService.service_type).map(
                          (model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              {newService.showCustomModelInput && (
                <div>
                  <Label htmlFor="new_custom_model_name_input">
                    {t('settings.aiService.globalSettings.customModelName')}
                  </Label>
                  <Input
                    id="new_custom_model_name_input"
                    value={newService.custom_model_name}
                    onChange={(e) =>
                      setNewService((prev) => ({
                        ...prev,
                        custom_model_name: e.target.value,
                      }))
                    }
                    placeholder={t('settings.aiService.globalSettings.customModelNamePlaceholder')}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="new_system_prompt">
                  {t('settings.aiService.globalSettings.systemPrompt')}
                </Label>
                <Textarea
                  id="new_system_prompt"
                  value={newService.system_prompt}
                  onChange={(e) =>
                    setNewService((prev) => ({
                      ...prev,
                      system_prompt: e.target.value,
                    }))
                  }
                  placeholder={t('settings.aiService.globalSettings.systemPromptPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="new_is_active"
                  checked={newService.is_active}
                  onCheckedChange={(checked) =>
                    setNewService((prev) => ({ ...prev, is_active: checked }))
                  }
                />
                <Label htmlFor="new_is_active">{t('settings.aiService.globalSettings.setAsActive')}</Label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  <Save className="h-4 w-4 mr-2" />
                  {t('settings.aiService.globalSettings.addService')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                >
                  <X className="h-4 w-4 mr-2" />
                  {t('settings.aiService.globalSettings.cancel')}
                </Button>
              </div>
            </form>
          )}

          {services.length > 0 && (
            <>
              <Separator />
              <h3 className="text-lg font-medium">{t('settings.aiService.globalSettings.globalServices')}</h3>

              <div className="space-y-4">
                {services.map((service) => (
                  <div key={service.id} className="border rounded-lg p-4">
                    {editingService === service.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleUpdateService(service.id);
                        }}
                        className="space-y-4"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>{t('settings.aiService.globalSettings.serviceName')}</Label>
                            <Input
                              value={editData.service_name || ''}
                              onChange={(e) =>
                                setEditData((prev) => ({
                                  ...prev,
                                  service_name: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor="edit_service_type">{t('settings.aiService.globalSettings.serviceType')}</Label>
                            <Select
                              value={editData.service_type || ''}
                              onValueChange={(value) =>
                                setEditData((prev) => ({
                                  ...prev,
                                  service_type: value,
                                  model_name: '',
                                }))
                              }
                            >
                              <SelectTrigger id="edit_service_type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {getServiceTypes().map((type) => (
                                  <SelectItem
                                    key={type.value}
                                    value={type.value}
                                  >
                                    {type.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div>
                          <Label>
                            {editData.service_type === 'ollama'
                              ? t('settings.aiService.globalSettings.apiKeyOptional')
                              : t('settings.aiService.globalSettings.apiKey')}
                          </Label>
                          <Input
                            type="password"
                            value={editData.api_key || ''}
                            onChange={(e) =>
                              setEditData((prev) => ({
                                ...prev,
                                api_key: e.target.value,
                              }))
                            }
                            placeholder={t('settings.aiService.globalSettings.enterNewApiKey')}
                            autoComplete="off"
                          />
                        </div>

                        {(editData.service_type === 'custom' ||
                          editData.service_type === 'ollama' ||
                          editData.service_type === 'openai_compatible') && (
                            <div>
                              <Label>{t('settings.aiService.globalSettings.customUrl')}</Label>
                              <Input
                                value={editData.custom_url || ''}
                                onChange={(e) =>
                                  setEditData((prev) => ({
                                    ...prev,
                                    custom_url: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          )}

                        <div className="flex items-center space-x-2 mb-4">
                          <Switch
                            id="edit_use_custom_model"
                            checked={editData.showCustomModelInput || false}
                            onCheckedChange={(checked) =>
                              setEditData((prev) => ({
                                ...prev,
                                showCustomModelInput: checked,
                                model_name: '',
                                custom_model_name: '',
                              }))
                            }
                          />
                          <Label htmlFor="edit_use_custom_model">
                            {t('settings.aiService.globalSettings.useCustomModel')}
                          </Label>
                        </div>

                        {!editData.showCustomModelInput &&
                          getModelOptions(editData.service_type || '').length >
                          0 && (
                            <div>
                              <Label htmlFor="edit_model_name_select">{t('settings.aiService.globalSettings.model')}</Label>
                              <Select
                                value={editData.model_name || ''}
                                onValueChange={(value) =>
                                  setEditData((prev) => ({
                                    ...prev,
                                    model_name: value,
                                  }))
                                }
                              >
                                <SelectTrigger id="edit_model_name_select">
                                  <SelectValue placeholder={t('settings.aiService.globalSettings.selectModel')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {getModelOptions(
                                    editData.service_type || ''
                                  ).map((model) => (
                                    <SelectItem key={model} value={model}>
                                      {model}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        {editData.showCustomModelInput && (
                          <div>
                            <Label>{t('settings.aiService.globalSettings.customModelName')}</Label>
                            <Input
                              value={editData.custom_model_name || ''}
                              onChange={(e) =>
                                setEditData((prev) => ({
                                  ...prev,
                                  custom_model_name: e.target.value,
                                }))
                              }
                              placeholder={t('settings.aiService.globalSettings.customModelNamePlaceholder')}
                            />
                          </div>
                        )}

                        <div>
                          <Label>{t('settings.aiService.globalSettings.systemPrompt')}</Label>
                          <Textarea
                            value={editData.system_prompt || ''}
                            onChange={(e) =>
                              setEditData((prev) => ({
                                ...prev,
                                system_prompt: e.target.value,
                              }))
                            }
                            placeholder={t('settings.aiService.globalSettings.systemPromptPlaceholder')}
                            rows={3}
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={editData.is_active || false}
                            onCheckedChange={(checked) =>
                              setEditData((prev) => ({
                                ...prev,
                                is_active: checked,
                              }))
                            }
                          />
                          <Label>{t('settings.aiService.globalSettings.activeService')}</Label>
                        </div>

                        <div className="flex gap-2">
                          <Button type="submit" disabled={loading}>
                            <Save className="h-4 w-4 mr-2" />
                            {t('settings.aiService.globalSettings.saveChanges')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={cancelEditing}
                          >
                            <X className="h-4 w-4 mr-2" />
                            {t('settings.aiService.globalSettings.cancel')}
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">
                                {service.service_name}
                              </h4>
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                                {t('settings.aiService.globalSettings.global')}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {getServiceTypes().find(
                                (t) => t.value === service.service_type
                              )?.label || service.service_type}
                              {service.model_name && ` - ${service.model_name}`}
                              {service.custom_url && ` - ${service.custom_url}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startEditing(service)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteService(service.id)}
                              disabled={loading}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {service.system_prompt && (
                          <div>
                            <Label className="text-xs">{t('settings.aiService.globalSettings.systemPrompt')}:</Label>
                            <p className="text-sm text-muted-foreground mt-1 p-2 bg-muted rounded">
                              {service.system_prompt}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {services.length === 0 && !showAddForm && (
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('settings.aiService.globalSettings.noServices')}</p>
              <p className="text-sm">
                {t('settings.aiService.globalSettings.noServicesDescription')}
              </p>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default GlobalAISettings;
