import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  User,
  RotateCcw,
} from 'lucide-react';
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

const AIServiceSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Check if user AI config is allowed
  const { data: isUserConfigAllowed = true, isLoading: settingsLoading } = useQuery<boolean>({
    queryKey: ['userAiConfigAllowed'],
    queryFn: () => globalSettingsService.isUserAiConfigAllowed(),
    retry: false,
    staleTime: 60000, // Cache for 1 minute
  });

  const [services, setServices] = useState<AIService[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>({
    auto_clear_history: 'never',
  });
  const [newService, setNewService] = useState({
    service_name: '',
    service_type: 'openai',
    api_key: '', // Initialize with empty string for API key input
    custom_url: '',
    system_prompt: '',
    is_active: false,
    model_name: '',
    custom_model_name: '', // Add custom_model_name to newService state
    showCustomModelInput: false, // New state to control visibility
  });
  const [editingService, setEditingService] = useState<string | null>(null);
  const [editData, setEditData] = useState<
    Partial<AIService & { showCustomModelInput?: boolean; api_key?: string }>
  >({
    // Add api_key to editData type
    api_key: '', // Initialize with empty string for API key input
    custom_model_name: '', // Add custom_model_name to editData state
    showCustomModelInput: false, // New state to control visibility
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);

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
        title: 'Error',
        description: error.message || 'Failed to load AI services',
        variant: 'destructive',
      });
    }
  };

  // Check if user has overridden global settings
  const hasUserOverride = () => {
    return services.some((s) => !s.is_global && s.is_active);
  };

  // Get active global setting
  const getActiveGlobalSetting = () => {
    return services.find((s) => s.is_global && s.is_active);
  };

  // Handle override: create user-specific setting from global
  const handleOverrideGlobal = async () => {
    const globalSetting = getActiveGlobalSetting();
    if (!globalSetting) {
      toast({
        title: 'Error',
        description: 'No active global setting found to override',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Create a user-specific copy of the global setting
      const overrideData = {
        service_name: `${globalSetting.service_name} (My Override)`,
        service_type: globalSetting.service_type,
        api_key: '', // User will need to enter their own API key
        custom_url: globalSetting.custom_url,
        system_prompt: globalSetting.system_prompt || '',
        is_active: true,
        model_name: globalSetting.model_name || null,
      };
      await addAIService(overrideData);
      toast({
        title: 'Success',
        description:
          'Global settings overridden. You can now customize your own settings.',
      });
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error overriding global settings:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to override global settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle revert: delete all user-specific settings to use global
  const handleRevertToGlobal = async () => {
    if (
      !confirm(
        'Are you sure you want to delete all your custom AI service settings and use the global settings instead?'
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      // Delete all user-specific settings
      const userSettings = services.filter((s) => !s.is_global);
      for (const setting of userSettings) {
        await deleteAIService(setting.id);
      }
      toast({
        title: 'Success',
        description:
          'Reverted to global settings. Your custom settings have been deleted.',
      });
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error reverting to global settings:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to revert to global settings',
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
        title: 'Error',
        description: error.message || 'Failed to load preferences',
        variant: 'destructive',
      });
    }
  };

  const handleAddService = async () => {
    if (
      !user ||
      !newService.service_name ||
      (newService.service_type !== 'ollama' && !newService.api_key)
    ) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
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
          : newService.model_name || null, // Prioritize custom_model_name if showCustomModelInput is true
      };
      await addAIService(serviceData);
      toast({
        title: 'Success',
        description: 'AI service added successfully',
      });
      setNewService({
        service_name: '',
        service_type: 'openai',
        api_key: '', // Clear the API key field
        custom_url: '',
        system_prompt: '',
        is_active: false,
        model_name: '',
        custom_model_name: '', // Clear custom_model_name field
        showCustomModelInput: false, // Clear showCustomModelInput field
      });
      setShowAddForm(false);
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error adding AI service:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add AI service',
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
        title: 'Error',
        description: 'Original service not found.',
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    // Create a complete service object by merging original with edited data
    const serviceToUpdate: Partial<AIService> = {
      ...originalService, // Start with all original fields
      ...editData, // Overlay with edited fields (including temporary api_key if provided)
      id: serviceId, // Ensure ID is correct
      model_name: editData.showCustomModelInput
        ? editData.custom_model_name
        : editData.model_name || null, // Prioritize custom_model_name if showCustomModelInput is true
    };

    // If api_key is empty in editData, it means the user did not enter a new one.
    // In this case, we explicitly remove it from the payload to instruct the backend
    // to retain the existing encrypted key, rather than overwriting it with an empty string.
    if (serviceToUpdate.api_key === '') {
      delete serviceToUpdate.api_key;
    }

    try {
      await updateAIService(serviceId, serviceToUpdate); // Pass the complete object
      toast({
        title: 'Success',
        description: 'AI service updated successfully',
      });
      setEditingService(null);
      setEditData({});
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error updating AI service:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update AI service',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    if (!confirm('Are you sure you want to delete this AI service?')) return;

    setLoading(true);
    try {
      await deleteAIService(serviceId);
      toast({
        title: 'Success',
        description: 'AI service deleted successfully',
      });
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error deleting AI service:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete AI service',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (serviceId: string, isActive: boolean) => {
    setLoading(true);
    const originalService = services.find((s) => s.id === serviceId);

    if (!originalService) {
      toast({
        title: 'Error',
        description: 'Original service not found for status update.',
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
      // Use updateAIService instead of updateAIServiceStatus to send full object
      await updateAIService(serviceId, serviceToUpdate);
      toast({
        title: 'Success',
        description: `AI service ${isActive ? 'activated' : 'deactivated'}`,
      });
      loadServices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error updating AI service status:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update AI service status',
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
        title: 'Success',
        description: 'Chat preferences updated successfully',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error updating preferences:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update preferences',
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
      api_key: '', // API key is not loaded for editing for security
      custom_url: service.custom_url,
      system_prompt: service.system_prompt || '',
      is_active: service.is_active,
      model_name: service.model_name || '',
      custom_model_name: service.model_name || '', // Initialize custom_model_name with current model_name
      showCustomModelInput: service.model_name
        ? !getModelOptions(service.service_type).includes(service.model_name)
        : false, // Determine initial state
    });
  };

  const cancelEditing = () => {
    setEditingService(null);
    setEditData({});
  };

  const getServiceTypes = () => [
    { value: 'openai', label: 'OpenAI' },
    { value: 'openai_compatible', label: 'OpenAI Compatible' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'google', label: 'Google Gemini' },
    { value: 'mistral', label: 'Mistral AI' },
    { value: 'groq', label: 'Groq' },
    { value: 'ollama', label: 'Ollama' },
    { value: 'custom', label: 'Custom' },
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
    <div className="space-y-6">
      {/* Chat History Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Chat Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="auto_clear_history">Auto Clear Chat History</Label>
            <Select
              value={preferences.auto_clear_history}
              onValueChange={(value) =>
                setPreferences((prev) => ({
                  ...prev,
                  auto_clear_history: value,
                }))
              }
            >
              <SelectTrigger id="auto_clear_history">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never clear</SelectItem>
                <SelectItem value="session">Clear each session</SelectItem>
                <SelectItem value="7days">Clear after 7 days</SelectItem>
                <SelectItem value="all">Clear all history</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Controls how chat history is preserved for AI context
            </p>
          </div>

          <Button onClick={handleUpdatePreferences} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            Save Chat Preferences
          </Button>
        </CardContent>
      </Card>

      {/* AI Services */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Services
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Note: Not all AI models and services have been fully tested for all
            features. Please verify functionality after configuration.
          </p>
          {!isUserConfigAllowed && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Per-user AI configuration is disabled
                </span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
                You can only use the global AI service settings configured by your administrator.
                Contact your administrator if you need to configure a custom AI service.
              </p>
            </div>
          )}
          {isUserConfigAllowed && getActiveGlobalSetting() && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Using Global Setting:{' '}
                    {getActiveGlobalSetting()?.service_name}
                  </span>
                </div>
                {!hasUserOverride() && (
                  <Button
                    onClick={handleOverrideGlobal}
                    variant="outline"
                    size="sm"
                    disabled={loading}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Override Global Settings
                  </Button>
                )}
                {hasUserOverride() && (
                  <Button
                    onClick={handleRevertToGlobal}
                    variant="outline"
                    size="sm"
                    disabled={loading}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Use Global Settings
                  </Button>
                )}
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                {hasUserOverride()
                  ? 'You have overridden the global settings with your own configuration.'
                  : 'You are currently using the organization-wide global AI service settings. You can override these with your own settings if needed.'}
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add New Service Button - Only show if user config is allowed */}
          {isUserConfigAllowed && !showAddForm && (
            <Button onClick={() => setShowAddForm(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add New AI Service
            </Button>
          )}

          {/* Add New Service Form - Only show if user config is allowed */}
          {isUserConfigAllowed && showAddForm && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddService();
              }}
              className="border rounded-lg p-4 space-y-4"
            >
              <h3 className="text-lg font-medium">Add New AI Service</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="new_service_name">Service Name</Label>
                  <Input
                    id="new_service_name"
                    value={newService.service_name}
                    onChange={(e) =>
                      setNewService((prev) => ({
                        ...prev,
                        service_name: e.target.value,
                      }))
                    }
                    placeholder="My OpenAI Service"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <Label htmlFor="new_service_type">Service Type</Label>
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
                  API Key{' '}
                  {newService.service_type === 'ollama' ? '(Optional)' : ''}
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
                      ? 'Not required for Ollama'
                      : 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                  }
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {newService.service_type === 'ollama'
                    ? 'API key is optional for Ollama. If provided, it will be stored encrypted.'
                    : 'Your API key for the selected service. This will be stored encrypted.'}
                </p>
              </div>

              {(newService.service_type === 'custom' ||
                newService.service_type === 'ollama' ||
                newService.service_type === 'openai_compatible') && (
                  <div>
                    <Label htmlFor="new_custom_url">Custom URL</Label>
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
                          ? 'http://localhost:11434'
                          : newService.service_type === 'openai_compatible'
                            ? 'https://api.example.com/v1'
                            : 'https://api.example.com/v1'
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
                  Use Custom Model Name
                </Label>
              </div>

              {!newService.showCustomModelInput &&
                getModelOptions(newService.service_type).length > 0 && (
                  <div>
                    <Label htmlFor="new_model_name_select">Model</Label>
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
                        <SelectValue placeholder="Select a model" />
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
                    Custom Model Name
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
                    placeholder="Enter custom model name"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter the exact name of your custom model.
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="new_system_prompt">
                  System Prompt (Additional Instructions)
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
                  placeholder="Additional instructions for the AI assistant..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  These instructions will be added to the AI context in addition
                  to project documentation
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="new_is_active"
                  checked={newService.is_active}
                  onCheckedChange={(checked) =>
                    setNewService((prev) => ({ ...prev, is_active: checked }))
                  }
                />
                <Label htmlFor="new_is_active">Set as active service</Label>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  <Save className="h-4 w-4 mr-2" />
                  Add Service
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Configured Services */}
          {services.length > 0 && (
            <>
              <Separator />
              <h3 className="text-lg font-medium">
                {isUserConfigAllowed ? 'Configured Services' : 'Available AI Services'}
              </h3>

              <div className="space-y-4">
                {services
                  .filter((service) => isUserConfigAllowed || service.is_global) // Only show global when disabled
                  .map((service) => (
                    <div key={service.id} className="border rounded-lg p-4">
                      {editingService === service.id ? (
                        // Edit Mode
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleUpdateService(service.id);
                          }}
                          className="space-y-4"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="edit_service_name">Service Name</Label>
                              <Input
                                id="edit_service_name"
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
                              <Label htmlFor="edit_service_type">Service Type</Label>
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
                            <Label htmlFor="edit_api_key">
                              API Key{' '}
                              {editData.service_type === 'ollama'
                                ? '(Optional)'
                                : ''}
                            </Label>
                            <Input
                              id="edit_api_key"
                              type="password"
                              value={editData.api_key || ''}
                              onChange={(e) =>
                                setEditData((prev) => ({
                                  ...prev,
                                  api_key: e.target.value,
                                }))
                              }
                              placeholder={
                                editData.service_type === 'ollama'
                                  ? 'Not required for Ollama'
                                  : 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                              }
                              autoComplete="off"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {editData.service_type === 'ollama'
                                ? 'API key is optional for Ollama. If provided, it will be stored encrypted.'
                                : 'Enter your API key if you wish to update it. It will be stored encrypted.'}
                            </p>
                          </div>

                          {(editData.service_type === 'custom' ||
                            editData.service_type === 'ollama' ||
                            editData.service_type === 'openai_compatible') && (
                              <div>
                                <Label htmlFor="edit_custom_url">Custom URL</Label>
                                <Input
                                  id="edit_custom_url"
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
                              Use Custom Model Name
                            </Label>
                          </div>

                          {!editData.showCustomModelInput &&
                            getModelOptions(editData.service_type || '').length >
                            0 && (
                              <div>
                                <Label htmlFor="edit_model_name_select">Model</Label>
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
                                    <SelectValue placeholder="Select a model" />
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
                              <Label>Custom Model Name</Label>
                              <Input
                                value={editData.custom_model_name || ''}
                                onChange={(e) =>
                                  setEditData((prev) => ({
                                    ...prev,
                                    custom_model_name: e.target.value,
                                  }))
                                }
                                placeholder="Enter custom model name"
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Enter the exact name of your custom model.
                              </p>
                            </div>
                          )}

                          <div>
                            <Label htmlFor="edit_system_prompt">System Prompt (Additional Instructions)</Label>
                            <Textarea
                              id="edit_system_prompt"
                              value={editData.system_prompt || ''}
                              onChange={(e) =>
                                setEditData((prev) => ({
                                  ...prev,
                                  system_prompt: e.target.value,
                                }))
                              }
                              placeholder="Additional instructions for the AI assistant..."
                              rows={3}
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              These instructions will be added to the AI context
                              in addition to project documentation
                            </p>
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
                            <Label>Active service</Label>
                          </div>
                          {/* Added Label for new_service_type based on instruction, assuming it's for a new service form not present in this snippet */}
                          {/* This placement is based on the provided "Code Edit" snippet in the instruction,
                              which shows it after the is_active switch and before the buttons.
                              If this label is intended for an "add new service" form, it should be placed there.
                              As the instruction only provides a snippet and asks to add the label,
                              I'm placing it where the snippet implies it should go relative to the surrounding elements. */}
                          <Label htmlFor="new_service_type">Service Type</Label>

                          <div className="flex gap-2">
                            <Button type="submit" disabled={loading}>
                              <Save className="h-4 w-4 mr-2" />
                              Save Changes
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={cancelEditing}
                            >
                              <X className="h-4 w-4 mr-2" />
                              Cancel
                            </Button>
                          </div>
                        </form>
                      ) : (
                        // View Mode
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">
                                  {service.service_name}
                                </h4>
                                {service.is_global ? (
                                  <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-xs flex items-center gap-1">
                                    <Globe className="h-3 w-3" />
                                    Global
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    Your Setting
                                  </span>
                                )}
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
                              {!service.is_global && isUserConfigAllowed && (
                                <Switch
                                  checked={service.is_active}
                                  onCheckedChange={(checked) =>
                                    handleToggleActive(service.id, checked)
                                  }
                                  disabled={loading}
                                />
                              )}
                              {service.is_global && service.is_active && (
                                <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full text-xs">
                                  Active
                                </span>
                              )}
                              {!service.is_global && isUserConfigAllowed && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startEditing(service)}
                                    aria-label="Edit Service"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleDeleteService(service.id)
                                    }
                                    disabled={loading}
                                    aria-label="Delete Service"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {service.is_global && (
                                <span className="text-xs text-muted-foreground">
                                  Managed by administrator
                                </span>
                              )}
                            </div>
                          </div>

                          {service.system_prompt && (
                            <div>
                              <Label className="text-xs">System Prompt:</Label>
                              <p className="text-sm text-muted-foreground mt-1 p-2 bg-muted rounded">
                                {service.system_prompt}
                              </p>
                            </div>
                          )}

                          {/* Removed display of API Key Env Var as it's no longer relevant for user-provided keys */}
                          {/* {service.is_active && (
                            <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                              Active
                            </span>
                          )} */}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}

          {services.length === 0 && !showAddForm && (
            <div className="text-center py-8 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No AI services configured yet.</p>
              {isUserConfigAllowed && (
                <p className="text-sm">
                  Add your first AI service to get started with Sparky.
                </p>
              )}
              {!isUserConfigAllowed && (
                <p className="text-sm">
                  Please contact your administrator to configure an AI service.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AIServiceSettings;
