import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIServiceSettings from '@/pages/Settings/AIServiceSettings';
import { renderWithClient } from '../test-utils';
import * as aiServiceSettingsService from '@/services/aiServiceSettingsService';
import * as globalSettingsService from '@/api/Admin/globalSettingsService';

// Mock react-i18next
const translations: Record<string, string> = {
  'settings.aiService.userSettings.title': 'AI Service Settings',
  'settings.aiService.userSettings.note':
    'Manage your personal AI service configurations.',
  'settings.aiService.userSettings.addNewService': 'Add New AI Service',
  'settings.aiService.userSettings.configuredServices': 'Configured Services',
  'settings.aiService.userSettings.availableServices': 'Available Services',
  'settings.aiService.userSettings.noServices': 'No AI services configured yet',
  'settings.aiService.userSettings.noServicesDescription':
    'Add a service to get started.',
  'settings.aiService.userSettings.perUserDisabledDescription':
    'User AI service configuration is disabled',
  'settings.aiService.userSettings.fillRequiredFields':
    'Please fill in all required fields',
  'settings.aiService.userSettings.success': 'Success',
  'settings.aiService.userSettings.serviceActivated': 'Service activated',
  'settings.aiService.userSettings.serviceDeactivated': 'Service deactivated',
  'settings.aiService.userSettings.errorOriginalNotFoundStatus':
    'Service not found',
  'settings.aiService.userSettings.error': 'Error',
  'settings.aiService.userSettings.deleteConfirm':
    'Are you sure you want to delete this service?',
  'settings.aiService.userSettings.delete': 'Delete Service',
  'settings.aiService.userSettings.cancel': 'Cancel',
  'settings.aiService.userSettings.saveChanges': 'Save Changes',
  'settings.aiService.userSettings.addService': 'Add Service',
  'settings.aiService.userSettings.successAdding':
    'AI service added successfully',
  'settings.aiService.userSettings.errorAdding': 'Failed to add AI service',
  'settings.aiService.userSettings.successUpdating':
    'AI service updated successfully',
  'settings.aiService.userSettings.errorUpdating':
    'Failed to update AI service',
  'settings.aiService.userSettings.successDeleting':
    'AI service deleted successfully',
  'settings.aiService.userSettings.errorDeleting':
    'Failed to delete AI service',
  'settings.aiService.userSettings.successUpdatingPreferences':
    'Preferences updated successfully',
  'settings.aiService.userSettings.errorUpdatingPreferences':
    'Failed to update preferences',
  'settings.aiService.userSettings.revertConfirm': 'Revert to global settings?',
  'settings.aiService.userSettings.useGlobalSettings': 'Use Global Settings',
  'settings.aiService.userSettings.successReverting':
    'Reverted to global settings',
  'settings.aiService.userSettings.errorReverting':
    'Failed to revert to global settings',
  'settings.aiService.serviceTypes.openai': 'OpenAI',
  'settings.aiService.serviceTypes.openaiCompatible': 'OpenAI Compatible',
  'settings.aiService.serviceTypes.anthropic': 'Anthropic',
  'settings.aiService.serviceTypes.google': 'Google',
  'settings.aiService.serviceTypes.mistral': 'Mistral',
  'settings.aiService.serviceTypes.groq': 'Groq',
  'settings.aiService.serviceTypes.ollama': 'Ollama',
  'settings.aiService.serviceTypes.custom': 'Custom',
  'settings.aiService.userSettings.serviceName': 'Service Name',
  'settings.aiService.userSettings.serviceNamePlaceholder':
    'Enter service name...',
  'settings.aiService.userSettings.serviceType': 'Service Type',
  'settings.aiService.userSettings.apiKey': 'API Key',
  'settings.aiService.userSettings.apiKeyOptional': 'API Key (Optional)',
  'settings.aiService.userSettings.customUrl': 'Custom URL',
  'settings.aiService.userSettings.useCustomModel': 'Use Custom Model Name',
  'settings.aiService.userSettings.model': 'Model',
  'settings.aiService.userSettings.customModelName': 'Custom Model Name',
  'settings.aiService.userSettings.systemPrompt': 'System Prompt',
  'settings.aiService.userSettings.activeService': 'Active Service',
  'settings.aiService.userSettings.setAsActive': 'Set as Active Service',
  'settings.aiService.userSettings.chatPreferences': 'Chat Preferences',
  'settings.aiService.userSettings.autoClearHistory': 'Auto Clear Chat History',
  'settings.aiService.userSettings.neverClear': 'Never',
  'settings.aiService.userSettings.clearEachSession':
    'Clear after each session',
  'settings.aiService.userSettings.clearAfter7Days': 'Clear after 7 days',
  'settings.aiService.userSettings.clearAllHistory': 'Clear all history',
  'settings.aiService.userSettings.autoClearHistoryDescription':
    'Automatically delete chat history after a set period.',
  'settings.aiService.userSettings.saveChatPreferences':
    'Save Chat Preferences',
  'settings.aiService.userSettings.perUserDisabled':
    'User configuration disabled',
  'settings.aiService.userSettings.usingGlobalSetting': 'Using global setting:',
  'settings.aiService.userSettings.overrideGlobalSettings':
    'Override Global Settings',
  'settings.aiService.userSettings.overrideDescription':
    'You are using your personal AI settings.',
  'settings.aiService.userSettings.globalDescription':
    'You are using the default global AI settings.',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValueOrOpts?: string | Record<string, unknown>) => {
      if (typeof defaultValueOrOpts === 'string') return defaultValueOrOpts;
      if (
        defaultValueOrOpts &&
        typeof defaultValueOrOpts === 'object' &&
        'defaultValue' in defaultValueOrOpts
      ) {
        return defaultValueOrOpts.defaultValue as string;
      }
      return translations[key] || key;
    },
  }),
}));

// Mock toast
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
  toast: (...args: unknown[]) => mockToast(...args),
}));

// Mock useAuth
const mockUser = { id: 'user1', email: 'test@example.com' };
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock services
const mockGetAIServices = jest.fn();
const mockGetPreferences = jest.fn();
const mockAddAIService = jest.fn();
const mockUpdateAIService = jest.fn();
const mockDeleteAIService = jest.fn();
const mockUpdateUserPreferences = jest.fn();
const mockIsUserAiConfigAllowed = jest.fn();

jest.mock('@/services/aiServiceSettingsService', () => ({
  getAIServices: (...args: unknown[]) => mockGetAIServices(...args),
  getPreferences: (...args: unknown[]) => mockGetPreferences(...args),
  addAIService: (...args: unknown[]) => mockAddAIService(...args),
  updateAIService: (...args: unknown[]) => mockUpdateAIService(...args),
  deleteAIService: (...args: unknown[]) => mockDeleteAIService(...args),
  updateUserPreferences: (...args: unknown[]) =>
    mockUpdateUserPreferences(...args),
}));

jest.mock('@/api/Admin/globalSettingsService', () => ({
  globalSettingsService: {
    isUserAiConfigAllowed: (...args: unknown[]) =>
      mockIsUserAiConfigAllowed(...args),
  },
}));

// Mock window.confirm
const mockConfirm = jest.fn();
window.confirm = mockConfirm;

const mockUserServices: aiServiceSettingsService.AIService[] = [
  {
    id: 'user-service1',
    service_name: 'My OpenAI',
    service_type: 'openai',
    api_key: undefined,
    custom_url: null,
    system_prompt: 'Custom prompt',
    is_active: true,
    model_name: 'gpt-4o',
    is_public: false,
    source: 'user',
  },
];

const mockPreferences: aiServiceSettingsService.UserPreferences = {
  auto_clear_history: '7days',
};

describe('AIServiceSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsUserAiConfigAllowed.mockResolvedValue(true);
    mockGetAIServices.mockResolvedValue(mockUserServices);
    mockGetPreferences.mockResolvedValue(mockPreferences);
  });

  it('renders the component', async () => {
    renderWithClient(<AIServiceSettings />);
    expect(await screen.findByText(/AI Service Settings/i)).toBeInTheDocument();
  });

  it('loads user AI services on mount', async () => {
    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(mockGetAIServices).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('My OpenAI')).toBeInTheDocument();
    });
  });

  it('loads user preferences on mount', async () => {
    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(mockGetPreferences).toHaveBeenCalled();
    });
  });

  it('checks if user AI config is allowed', async () => {
    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(mockIsUserAiConfigAllowed).toHaveBeenCalled();
    });
  });

  it('shows disabled message when user AI config is not allowed', async () => {
    mockIsUserAiConfigAllowed.mockResolvedValue(false);

    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(
        screen.getByText(/User AI service configuration is disabled/i)
      ).toBeInTheDocument();
    });
  });

  it('hides add service button when user config is disabled', async () => {
    mockIsUserAiConfigAllowed.mockResolvedValue(false);

    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      const addButton = screen.queryByText(/Add New AI Service/i);
      expect(addButton).not.toBeInTheDocument();
    });
  });

  it('shows add form when add button is clicked', async () => {
    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(screen.getByText(/Add New AI Service/i)).toBeInTheDocument();
    });

    const addButton = screen.getByText(/Add New AI Service/i);
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByLabelText('Service Name')).toBeInTheDocument();
    });
  });

  it('validates required fields when adding service', async () => {
    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      const addButton = screen.getByText(/Add New AI Service/i);
      fireEvent.click(addButton);
    });

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: 'Add Service' });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          description: 'Please fill in all required fields',
          variant: 'destructive',
        })
      );
    });
  });

  it('creates a new user AI service with valid data', async () => {
    const newService = {
      id: 'new-user-service',
      ...mockUserServices[0],
      service_name: 'New User Service',
    };
    mockAddAIService.mockResolvedValue(newService);

    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      const addButton = screen.getByRole('button', {
        name: 'Add New AI Service',
      });
      fireEvent.click(addButton);
    });

    await waitFor(() => {
      const serviceNameInput = screen.getByLabelText('Service Name');
      fireEvent.change(serviceNameInput, {
        target: { value: 'New User Service' },
      });

      const apiKeyInput = screen.getByLabelText(/API Key/i);
      fireEvent.change(apiKeyInput, {
        target: { value: 'sk-user-key' },
      });

      const submitButton = screen.getByRole('button', { name: 'Add Service' });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(mockAddAIService).toHaveBeenCalledWith(
        expect.objectContaining({
          service_name: 'New User Service',
          api_key: 'sk-user-key',
        })
      );
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Success',
        })
      );
    });
  });

  it('allows adding ollama service without API key', async () => {
    const newService = {
      id: 'ollama-user-service',
      service_name: 'User Ollama',
      service_type: 'ollama',
      custom_url: 'http://localhost:11434',
      is_active: false,
    };
    mockAddAIService.mockResolvedValue(newService);

    renderWithClient(<AIServiceSettings />);

    const addButton = await screen.findByRole('button', {
      name: 'Add New AI Service',
    });
    fireEvent.click(addButton);

    const serviceNameInput = await screen.findByLabelText('Service Name');
    fireEvent.change(serviceNameInput, {
      target: { value: 'User Ollama' },
    });

    // Select 'ollama' from dropdown
    const serviceTypeTrigger = screen.getByLabelText('Service Type', {
      selector: 'button',
    });
    fireEvent.click(serviceTypeTrigger);

    const ollamaOption = await screen.findByRole('option', { name: /ollama/i });
    fireEvent.click(ollamaOption);

    // Check if state updated by verifying Custom URL appears
    await waitFor(() => {
      expect(screen.getByLabelText('Custom URL')).toBeInTheDocument();
    });

    // API key should be optional for ollama
    // API key should be optional for ollama
    // Check for API Key label with Optional text
    await waitFor(() => {
      const labels = screen.getAllByText(/API Key/i);
      const optionalLabel = labels.find((l) =>
        l.textContent?.includes('Optional')
      );
      expect(optionalLabel).toBeInTheDocument();
    });
  });

  it('updates a user service', async () => {
    const updatedService = {
      ...mockUserServices[0],
      service_name: 'Updated My OpenAI',
    };
    mockUpdateAIService.mockResolvedValue(updatedService);

    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(screen.getByText('My OpenAI')).toBeInTheDocument();
    });

    // Wait for service to be visible
    const serviceName = await screen.findByText('My OpenAI');
    const serviceCard = serviceName.closest('.border');

    // Find the edit button inside the card using accessible label
    const editButton = await screen.findByRole('button', {
      name: 'Edit Service',
    });
    fireEvent.click(editButton);

    const serviceNameInput = await screen.findByLabelText('Service Name');
    fireEvent.change(serviceNameInput, {
      target: { value: 'Updated My OpenAI' },
    });

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateAIService).toHaveBeenCalledWith(
        'user-service1',
        expect.objectContaining({
          service_name: 'Updated My OpenAI',
        })
      );
    });
  });

  it('deletes a user service with confirmation', async () => {
    mockDeleteAIService.mockResolvedValue(true);

    renderWithClient(<AIServiceSettings />);

    const serviceName = await screen.findByText('My OpenAI');
    expect(serviceName).toBeInTheDocument();

    // Find the delete button on the card
    const deleteButton = await screen.findByRole('button', {
      name: 'Delete Service',
    });
    fireEvent.click(deleteButton);

    // Wait for dialog to open
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toBeInTheDocument();

    // Find confirm button inside dialog (also named 'Delete Service')
    const confirmButton = within(dialog).getByRole('button', {
      name: 'Delete Service',
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockDeleteAIService).toHaveBeenCalledWith('user-service1');
    });
  });

  it('updates user preferences', async () => {
    const updatedPreferences = {
      auto_clear_history: '30days',
    };
    mockUpdateUserPreferences.mockResolvedValue(updatedPreferences);

    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/Auto Clear Chat History/i)
      ).toBeInTheDocument();
    });

    const autoClearTrigger = screen.getByLabelText(/Auto Clear Chat History/i);
    fireEvent.pointerDown(autoClearTrigger);

    const option = await screen.findByRole('option', {
      name: /Clear after 7 days/i,
    });
    fireEvent.click(option);

    const saveButton = screen.getByRole('button', {
      name: /Save Chat Preferences/i,
    });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateUserPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          auto_clear_history: '7days',
        })
      );
    });
  });

  it('handles error when loading services fails', async () => {
    const error = new Error('Failed to load services');
    mockGetAIServices.mockRejectedValue(error);

    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          variant: 'destructive',
        })
      );
    });
  });

  it('handles error when creating service fails', async () => {
    const error = new Error('Failed to create service');
    mockAddAIService.mockRejectedValue(error);

    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      const addButton = screen.getByText(/Add New AI Service/i);
      fireEvent.click(addButton);
    });

    await waitFor(() => {
      const serviceNameInput = screen.getByLabelText('Service Name');
      fireEvent.change(serviceNameInput, {
        target: { value: 'Test Service' },
      });

      const apiKeyInput = screen.getByLabelText(/API Key/i);
      fireEvent.change(apiKeyInput, {
        target: { value: 'sk-test' },
      });

      const submitButton = screen.getByRole('button', { name: 'Add Service' });
      fireEvent.click(submitButton);
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          variant: 'destructive',
        })
      );
    });
  });

  it('shows empty state when no user services exist', async () => {
    mockGetAIServices.mockResolvedValue([]);

    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(
        screen.getByText(/No AI services configured yet/i)
      ).toBeInTheDocument();
    });
  });

  it('displays service information correctly', async () => {
    renderWithClient(<AIServiceSettings />);

    const serviceName = await screen.findByText('My OpenAI');
    expect(serviceName).toBeInTheDocument();

    // There might be multiple elements with "OpenAI"
    const openAIElements = screen.getAllByText(/OpenAI/i);
    expect(openAIElements.length).toBeGreaterThan(0);

    const gpt4oElements = screen.getAllByText(/gpt-4o/i);
    expect(gpt4oElements.length).toBeGreaterThan(0);
  });

  it('shows custom model input when toggle is enabled', async () => {
    renderWithClient(<AIServiceSettings />);

    const addButton = await screen.findByRole('button', {
      name: 'Add New AI Service',
    });
    fireEvent.click(addButton);

    await waitFor(() => {
      const customModelToggle = screen.getByLabelText('Use Custom Model Name');
      fireEvent.click(customModelToggle);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Custom Model Name')).toBeInTheDocument();
    });
  });

  it('displays system prompt when present', async () => {
    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(screen.getByText('Custom prompt')).toBeInTheDocument();
    });
  });
});
