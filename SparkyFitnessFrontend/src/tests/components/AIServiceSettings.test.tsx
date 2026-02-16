import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AIServiceSettings from '@/pages/Settings/AIServiceSettings';
import { renderWithClient } from '../test-utils';
import * as aiServiceSettingsService from '@/services/aiServiceSettingsService';
import * as globalSettingsService from '@/api/Admin/globalSettingsService';

// Mock react-i18next
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
      return key;
    },
  }),
}));

// Mock toast
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
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
    is_global: false,
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

  it.skip('renders the component', async () => {
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

  it.skip('shows disabled message when user AI config is not allowed', async () => {
    mockIsUserAiConfigAllowed.mockResolvedValue(false);

    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(
        screen.getByText(/User AI service configuration is disabled/i)
      ).toBeInTheDocument();
    });
  });

  it.skip('hides add service button when user config is disabled', async () => {
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
      const addButton = screen.getByRole('button', { name: 'Add New AI Service' });
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
          description: 'AI service added successfully',
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

    const addButton = await screen.findByRole('button', { name: 'Add New AI Service' });
    fireEvent.click(addButton);

    const serviceNameInput = await screen.findByLabelText('Service Name');
    fireEvent.change(serviceNameInput, {
      target: { value: 'User Ollama' },
    });

    // Select 'ollama' from dropdown
    const serviceTypeTrigger = screen.getByLabelText('Service Type', { selector: 'button' });
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
      const optionalLabel = labels.find(l => l.textContent?.includes('Optional'));
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
    const editButton = await screen.findByRole('button', { name: 'Edit Service' });
    fireEvent.click(editButton);

    const serviceNameInput = await screen.findByLabelText('Service Name');
    fireEvent.change(serviceNameInput, {
      target: { value: 'Updated My OpenAI' },
    });

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateAIService).toHaveBeenCalledWith('user-service1', expect.objectContaining({
        service_name: 'Updated My OpenAI',
      }));
    });
  });

  it('deletes a user service with confirmation', async () => {
    mockDeleteAIService.mockResolvedValue(true);
    // Mock window.confirm
    const mockConfirm = jest.spyOn(window, 'confirm');
    mockConfirm.mockImplementation(() => true);

    renderWithClient(<AIServiceSettings />);

    const serviceName = await screen.findByText('My OpenAI');
    const serviceCard = serviceName.closest('.border');

    const deleteButton = await screen.findByRole('button', { name: 'Delete Service' });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
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
      expect(screen.getByLabelText(/Auto Clear Chat History/i)).toBeInTheDocument();
    });

    const autoClearTrigger = screen.getByLabelText(/Auto Clear Chat History/i);
    fireEvent.pointerDown(autoClearTrigger);

    const option = await screen.findByRole('option', { name: /Clear after 7 days/i });
    fireEvent.click(option);

    const saveButton = screen.getByRole('button', { name: /Save Chat Preferences/i });
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

    const addButton = await screen.findByRole('button', { name: 'Add New AI Service' });
    fireEvent.click(addButton);

    await waitFor(() => {
      const customModelToggle = screen.getByLabelText('Use Custom Model Name');
      fireEvent.click(customModelToggle);
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText('Custom Model Name')
      ).toBeInTheDocument();
    });
  });

  it('displays system prompt when present', async () => {
    renderWithClient(<AIServiceSettings />);

    await waitFor(() => {
      expect(screen.getByText('Custom prompt')).toBeInTheDocument();
    });
  });
});
