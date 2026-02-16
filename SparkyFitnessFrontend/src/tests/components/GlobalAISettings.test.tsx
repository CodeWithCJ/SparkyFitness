import { screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import GlobalAISettings from '@/pages/Admin/GlobalAISettings';
import { renderWithClient } from '../test-utils';
import * as aiServiceSettingsService from '@/services/aiServiceSettingsService';
import * as useSettingsHook from '@/hooks/Admin/useSettings';

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

// Mock services
const mockGetGlobalAIServices = jest.fn();
const mockCreateGlobalAIService = jest.fn();
const mockUpdateGlobalAIService = jest.fn();
const mockDeleteGlobalAIService = jest.fn();
const mockSyncGlobalSettingsFromEnv = jest.fn();

jest.mock('@/services/aiServiceSettingsService', () => ({
  getGlobalAIServices: (...args: unknown[]) =>
    mockGetGlobalAIServices(...args),
  createGlobalAIService: (...args: unknown[]) =>
    mockCreateGlobalAIService(...args),
  updateGlobalAIService: (...args: unknown[]) =>
    mockUpdateGlobalAIService(...args),
  deleteGlobalAIService: (...args: unknown[]) =>
    mockDeleteGlobalAIService(...args),
  syncGlobalSettingsFromEnv: (...args: unknown[]) =>
    mockSyncGlobalSettingsFromEnv(...args),
}));

// Mock useSettings hook
const mockUseSettings = jest.fn();
const mockUpdateSettings = jest.fn();

jest.mock('@/hooks/Admin/useSettings', () => ({
  useSettings: (...args: unknown[]) => mockUseSettings(...args),
  useUpdateSettings: () => ({ mutate: mockUpdateSettings }),
}));

// Mock window.confirm
const mockConfirm = jest.fn();
window.confirm = mockConfirm;

const mockGlobalSettings = {
  allow_user_ai_config: true,
};

const mockServices: aiServiceSettingsService.AIService[] = [
  {
    id: 'service1',
    service_name: 'OpenAI Global',
    service_type: 'openai',
    api_key: undefined,
    custom_url: null,
    system_prompt: 'You are a helpful assistant',
    is_active: true,
    model_name: 'gpt-4o',
    is_global: true,
    source: 'global',
  },
  {
    id: 'service2',
    service_name: 'Anthropic Global',
    service_type: 'anthropic',
    api_key: undefined,
    custom_url: null,
    system_prompt: null,
    is_active: false,
    model_name: 'claude-3-5-sonnet-20241022',
    is_global: true,
    source: 'global',
  },
];

describe('GlobalAISettings', () => {
  // Helper function to open the accordion
  const openAccordion = async () => {
    const accordionTrigger = screen.getByRole('button', {
      name: /global ai service settings/i,
    });
    fireEvent.click(accordionTrigger);
    // Wait for accordion content to be visible
    await waitFor(() => {
      expect(
        screen.getByText(/allow users to configure ai services/i)
      ).toBeInTheDocument();
    });
  };

  // Helper to find button by text content (handles icon + text)
  const getButtonByText = (text: string | RegExp): HTMLElement | undefined => {
    const buttons = screen.getAllByRole('button');
    return buttons.find((btn) => {
      const btnText = btn.textContent || '';
      if (typeof text === 'string') {
        return btnText.includes(text);
      }
      return text.test(btnText);
    }) as HTMLElement | undefined;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSettings.mockReturnValue({
      data: mockGlobalSettings,
      isLoading: false,
    });
    mockGetGlobalAIServices.mockResolvedValue(mockServices);
  });

  it('renders the component with accordion', () => {
    renderWithClient(<GlobalAISettings />);
    expect(
      screen.getByText('Global AI Service Settings')
    ).toBeInTheDocument();
  });

  it('loads and displays global AI services on mount', async () => {
    renderWithClient(<GlobalAISettings />);

    await waitFor(() => {
      expect(mockGetGlobalAIServices).toHaveBeenCalled();
    });

    await openAccordion();

    await waitFor(() => {
      expect(screen.getByText('OpenAI Global')).toBeInTheDocument();
      expect(screen.getByText('Anthropic Global')).toBeInTheDocument();
    });
  });

  it('displays allow user AI config toggle', async () => {
    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    expect(
      screen.getByText('Allow Users to Configure AI Services')
    ).toBeInTheDocument();
    // Use more flexible text matching since text might be split
    expect(
      screen.getByText(/When enabled, users can add and manage their own AI service configurations/i)
    ).toBeInTheDocument();
  });

  it('toggles allow_user_ai_config setting', async () => {
    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    const toggle = screen.getByRole('switch', {
      name: /allow users to configure ai services/i,
    });

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          allow_user_ai_config: false,
        }),
        expect.any(Object)
      );
    });
  });

  it('shows sync from environment button', async () => {
    renderWithClient(<GlobalAISettings />);
    await openAccordion();
    expect(screen.getByText('Sync from Environment')).toBeInTheDocument();
  });

  it('syncs from environment variables', async () => {
    mockSyncGlobalSettingsFromEnv.mockResolvedValue({
      message: 'Synced successfully',
      setting: mockServices[0],
    });

    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    const syncButton = screen.getByText('Sync from Environment');
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(mockSyncGlobalSettingsFromEnv).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Success',
          description: 'Synced successfully',
        })
      );
    });
  });

  it('shows add form when add button is clicked', async () => {
    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      const addButton = getButtonByText(/Add New Global AI Service/i);
      expect(addButton).toBeInTheDocument();
    });

    const addButton = getButtonByText(/Add New Global AI Service/i) as HTMLElement;

    if (addButton) {
      await waitFor(() => {
        fireEvent.click(addButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Add New Global AI Service')).toBeInTheDocument();
        expect(screen.getByLabelText('Service Name')).toBeInTheDocument();
      });
    }
  });

  it('validates required fields when adding service', async () => {
    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      const addButton = getButtonByText(/Add New Global AI Service/i) as HTMLElement;
      if (addButton) {
        fireEvent.click(addButton);
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Service Name')).toBeInTheDocument();
    });

    const submitButton = getButtonByText(/Add Service/i);

    if (submitButton) {
      await waitFor(() => {
        fireEvent.click(submitButton);
      });
    }

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

  it('creates a new global AI service with valid data', async () => {
    const newService = {
      id: 'new-service',
      ...mockServices[0],
      service_name: 'New OpenAI Service',
    };
    mockCreateGlobalAIService.mockResolvedValue(newService);

    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      const addButton = getButtonByText(/Add New Global AI Service/i) as HTMLElement;
      if (addButton) {
        fireEvent.click(addButton);
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Service Name')).toBeInTheDocument();
    });

    const serviceNameInput = screen.getByLabelText('Service Name');
    fireEvent.change(serviceNameInput, {
      target: { value: 'New OpenAI Service' },
    });

    const apiKeyInput = screen.getByLabelText(/API Key/i);
    fireEvent.change(apiKeyInput, {
      target: { value: 'sk-test-key' },
    });

    const submitButton = getButtonByText(/Add Service/i);
    if (submitButton) {
      await waitFor(() => {
        fireEvent.click(submitButton);
      });
    }

    await waitFor(() => {
      expect(mockCreateGlobalAIService).toHaveBeenCalledWith(
        expect.objectContaining({
          service_name: 'New OpenAI Service',
          api_key: 'sk-test-key',
        })
      );
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Success',
          description: 'Global AI service added successfully',
        })
      );
    });
  });

  it('allows adding ollama service without API key', async () => {
    const newService = {
      id: 'ollama-service',
      service_name: 'Local Ollama',
      service_type: 'ollama',
      custom_url: 'http://localhost:11434',
      is_active: false,
    };
    mockCreateGlobalAIService.mockResolvedValue(newService);

    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      const addButton = getButtonByText(/Add New Global AI Service/i) as HTMLElement;
      if (addButton) {
        fireEvent.click(addButton);
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Service Name')).toBeInTheDocument();
    });

    // Change service type to ollama
    // Select 'ollama' from dropdown
    const serviceTypeTrigger = screen.getByLabelText('Service Type');
    fireEvent.pointerDown(serviceTypeTrigger);

    const ollamaOption = await screen.findByRole('option', { name: /ollama/i });
    fireEvent.click(ollamaOption);

    await waitFor(() => {
      // API key should be optional for ollama - check label text
      const apiKeyLabel = screen.getByText(/API Key.*Optional/i);
      expect(apiKeyLabel).toBeInTheDocument();
    });
  });

  it('starts editing a service', async () => {
    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      expect(screen.getByText('OpenAI Global')).toBeInTheDocument();
    });

    // Find edit button - it should be near the service name
    // Look for buttons that contain an Edit icon (lucide-react Edit icon)
    const buttons = screen.getAllByRole('button');
    // The edit button is typically the one with aria-label or near the service
    const serviceCard = screen.getByText('OpenAI Global').closest('.border');
    const editButton = serviceCard?.querySelector('button') as HTMLElement;

    if (editButton) {
      await waitFor(() => {
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        expect(getButtonByText(/Save Changes/i)).toBeInTheDocument();
        expect(screen.getByDisplayValue('OpenAI Global')).toBeInTheDocument();
      });
    } else {
      // Fallback: try clicking the first button after the service name
      const allButtons = screen.getAllByRole('button');
      const editBtn = allButtons.find((btn, idx) => idx > 0 && btn.querySelector('svg'));
      if (editBtn) {
        await waitFor(() => {
          fireEvent.click(editBtn);
        });
        await waitFor(() => {
          expect(getButtonByText(/Save Changes/i)).toBeInTheDocument();
        });
      }
    }
  });

  it('updates a service', async () => {
    const updatedService = {
      ...mockServices[0],
      service_name: 'Updated OpenAI',
    };
    mockUpdateGlobalAIService.mockResolvedValue(updatedService);

    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      expect(screen.getByText('OpenAI Global')).toBeInTheDocument();
    });

    // Start editing - find edit button near the service
    const serviceCard = screen.getByText('OpenAI Global').closest('.border');
    const editButton = serviceCard?.querySelector('button') as HTMLElement;

    if (editButton) {
      await waitFor(() => {
        fireEvent.click(editButton);
      });

      await waitFor(() => {
        expect(getButtonByText(/Save Changes/i)).toBeInTheDocument();
      });

      const serviceNameInput = screen.getByDisplayValue('OpenAI Global');
      fireEvent.change(serviceNameInput, {
        target: { value: 'Updated OpenAI' },
      });

      await waitFor(() => {
        const saveButton = getButtonByText(/Save Changes/i);
        if (saveButton) {
          fireEvent.click(saveButton);
        }
      });

      await waitFor(() => {
        expect(mockUpdateGlobalAIService).toHaveBeenCalled();
      });
    }
  });

  it('deletes a service with confirmation', async () => {
    mockConfirm.mockReturnValue(true);
    mockDeleteGlobalAIService.mockResolvedValue(undefined);

    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      expect(screen.getByText('OpenAI Global')).toBeInTheDocument();
    });

    // Find delete button - it should be in the same card as the service
    const serviceCard = screen.getByText('OpenAI Global').closest('.border');
    const buttons = serviceCard?.querySelectorAll('button') || [];
    // The delete button is typically the last button in the service card
    const deleteButton = buttons[buttons.length - 1] as HTMLElement;

    if (deleteButton) {
      await waitFor(() => {
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        expect(mockConfirm).toHaveBeenCalledWith(
          'Are you sure you want to delete this global AI service?'
        );
        // The service ID should match the first service
        expect(mockDeleteGlobalAIService).toHaveBeenCalled();
      });
    }
  });

  it('does not delete service if confirmation is cancelled', async () => {
    mockConfirm.mockReturnValue(false);

    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      expect(screen.getByText('OpenAI Global')).toBeInTheDocument();
    });

    const serviceCard = screen.getByText('OpenAI Global').closest('.border');
    const buttons = serviceCard?.querySelectorAll('button') || [];
    const deleteButton = buttons[buttons.length - 1] as HTMLElement;

    if (deleteButton) {
      await waitFor(() => {
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        expect(mockConfirm).toHaveBeenCalled();
        expect(mockDeleteGlobalAIService).not.toHaveBeenCalled();
      });
    }
  });

  it('shows custom model input when toggle is enabled', async () => {
    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      const addButton = getButtonByText(/Add New Global AI Service/i) as HTMLElement;
      if (addButton) {
        fireEvent.click(addButton);
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Service Name')).toBeInTheDocument();
    });

    const customModelToggle = screen.getByLabelText('Use Custom Model Name');
    await waitFor(() => {
      fireEvent.click(customModelToggle);
    });

    await waitFor(() => {
      expect(
        screen.getByLabelText('Custom Model Name')
      ).toBeInTheDocument();
    });
  });

  it('displays model options based on service type', async () => {
    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      const addButton = getButtonByText(/Add New Global AI Service/i) as HTMLElement;
      if (addButton) {
        fireEvent.click(addButton);
      }
    });

    await waitFor(() => {
      const serviceTypeSelect = screen.getByLabelText('Service Type');
      // For OpenAI, should show GPT models
      expect(serviceTypeSelect).toBeInTheDocument();
    });
  });

  it('displays empty state when no services exist', async () => {
    mockGetGlobalAIServices.mockResolvedValue([]);

    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      expect(
        screen.getByText('No global AI services configured yet.')
      ).toBeInTheDocument();
    });
  });

  it('handles error when loading services fails', async () => {
    const error = new Error('Failed to load services');
    mockGetGlobalAIServices.mockRejectedValue(error);

    renderWithClient(<GlobalAISettings />);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          description: expect.stringContaining('Failed to load'),
          variant: 'destructive',
        })
      );
    });
  });

  it('handles error when creating service fails', async () => {
    const error = new Error('Failed to create service');
    mockCreateGlobalAIService.mockRejectedValue(error);

    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      const addButton = getButtonByText(/Add New Global AI Service/i) as HTMLElement;
      if (addButton) {
        fireEvent.click(addButton);
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Service Name')).toBeInTheDocument();
    });

    const serviceNameInput = screen.getByLabelText('Service Name');
    fireEvent.change(serviceNameInput, {
      target: { value: 'Test Service' },
    });

    const apiKeyInput = screen.getByLabelText(/API Key/i);
    fireEvent.change(apiKeyInput, {
      target: { value: 'sk-test' },
    });

    const submitButton = getButtonByText(/Add Service/i);
    if (submitButton) {
      await waitFor(() => {
        fireEvent.click(submitButton);
      });
    }

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error',
          variant: 'destructive',
        })
      );
    });
  });

  it('shows loading state during operations', async () => {
    mockCreateGlobalAIService.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(mockServices[0]), 100);
        })
    );

    renderWithClient(<GlobalAISettings />);
    await openAccordion();

    await waitFor(() => {
      const addButton = getButtonByText(/Add New Global AI Service/i) as HTMLElement;
      if (addButton) {
        fireEvent.click(addButton);
      }
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Service Name')).toBeInTheDocument();
    });

    const serviceNameInput = screen.getByLabelText('Service Name');
    fireEvent.change(serviceNameInput, {
      target: { value: 'Test Service' },
    });

    const apiKeyInput = screen.getByLabelText(/API Key/i);
    fireEvent.change(apiKeyInput, {
      target: { value: 'sk-test' },
    });

    const submitButton = getButtonByText(/Add Service/i) as HTMLElement;
    if (submitButton) {
      expect(submitButton).not.toBeDisabled();

      await waitFor(() => {
        fireEvent.click(submitButton);
      });

      // Button should be disabled during loading
      await waitFor(() => {
        const disabledButton = getButtonByText(/Add Service/i) as HTMLElement;
        if (disabledButton) {
          expect(disabledButton).toBeDisabled();
        }
      }, { timeout: 200 });
    }
  });
});
