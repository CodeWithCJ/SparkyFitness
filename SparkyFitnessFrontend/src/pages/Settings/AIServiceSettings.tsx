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
import { Bot, Plus, Trash2, Edit, Save, X } from 'lucide-react';
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

const AIServiceSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
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
  }, [user]);

  const loadServices = async () => {
    if (!user) return;

    try {
      const data = await getAIServices();
      setServices(data);
    } catch (error: any) {
      console.error('Error loading AI services:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load AI services',
        variant: 'destructive',
      });
    }
  };

  const loadPreferences = async () => {
    if (!user) return;

    try {
      const data = await getPreferences();
      setPreferences({
        auto_clear_history: data.auto_clear_history || 'never',
      });
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
              <SelectTrigger>
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
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add New Service Button */}
          {!showAddForm && (
            <Button onClick={() => setShowAddForm(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add New AI Service
            </Button>
          )}

          {/* Add New Service Form */}
          {showAddForm && (
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
                    <SelectTrigger>
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
              <h3 className="text-lg font-medium">Configured Services</h3>

              <div className="space-y-4">
                {services.map((service) => (
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
                            <Label>Service Name</Label>
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
                            <Label>Service Type</Label>
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
                              <SelectTrigger>
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
                            API Key{' '}
                            {editData.service_type === 'ollama'
                              ? '(Optional)'
                              : ''}
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
                            <Label>Custom URL</Label>
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
                            Use Custom Model Name
                          </Label>
                        </div>

                        {!editData.showCustomModelInput &&
                          getModelOptions(editData.service_type || '').length >
                            0 && (
                            <div>
                              <Label>Model</Label>
                              <Select
                                value={editData.model_name || ''}
                                onValueChange={(value) =>
                                  setEditData((prev) => ({
                                    ...prev,
                                    model_name: value,
                                  }))
                                }
                              >
                                <SelectTrigger>
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
                          <Label>System Prompt (Additional Instructions)</Label>
                          <Textarea
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
                            <h4 className="font-medium">
                              {service.service_name}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {getServiceTypes().find(
                                (t) => t.value === service.service_type
                              )?.label || service.service_type}
                              {service.model_name && ` - ${service.model_name}`}
                              {service.custom_url && ` - ${service.custom_url}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={service.is_active}
                              onCheckedChange={(checked) =>
                                handleToggleActive(service.id, checked)
                              }
                              disabled={loading}
                            />
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
              <p className="text-sm">
                Add your first AI service to get started with Sparky.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AIServiceSettings;
