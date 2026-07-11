import { fireEvent, screen } from '@testing-library/react';
import { renderWithClient } from '../test-utils';
import { ServiceForm } from '@/components/ai/ServiceForm';
import type { AiServiceSettingsFormInput } from '@/schemas/form/AiServiceSettings.form.zod';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

function makeFormData(
  overrides: Partial<AiServiceSettingsFormInput> = {}
): AiServiceSettingsFormInput {
  return {
    service_name: 'My Service',
    service_type: 'openai',
    api_key: 'sk-test',
    custom_url: '',
    system_prompt: '',
    is_active: false,
    model_name: '',
    custom_model_name: '',
    showCustomModelInput: false,
    chat_tool_profile: 'full',
    ...overrides,
  } as AiServiceSettingsFormInput;
}

function renderForm(
  formData: AiServiceSettingsFormInput,
  onSubmit = jest.fn()
) {
  const utils = renderWithClient(
    <ServiceForm
      formData={formData}
      onFormDataChange={jest.fn()}
      onSubmit={onSubmit}
      onCancel={jest.fn()}
      translationPrefix="settings.aiService.userSettings"
    />
  );
  return { ...utils, onSubmit };
}

describe('ServiceForm — model validation', () => {
  afterEach(() => {
    mockToast.mockClear();
  });

  // Regression: types without preset models (openai_compatible/custom/ollama)
  // point at user-hosted servers with no reliable server-side default, so the
  // form must not save them without an explicit model.
  it('blocks submit for a no-preset type with no model', () => {
    const { container, onSubmit } = renderForm(
      makeFormData({
        service_type: 'openai_compatible',
        custom_url: 'http://localhost:1234/v1',
        showCustomModelInput: true,
        custom_model_name: '',
        model_name: '',
      })
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('treats a whitespace-only custom model as missing', () => {
    const { container, onSubmit } = renderForm(
      makeFormData({
        service_type: 'custom',
        custom_url: 'http://localhost:1234/v1',
        showCustomModelInput: true,
        custom_model_name: '   ',
        model_name: '',
      })
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('submits a no-preset type when a custom model name is provided', () => {
    const { container, onSubmit } = renderForm(
      makeFormData({
        service_type: 'openai_compatible',
        custom_url: 'http://localhost:1234/v1',
        showCustomModelInput: true,
        custom_model_name: 'llama-3.2',
        model_name: '',
      })
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  // Preset providers (openai, anthropic, ...) have a sensible server-side
  // default, so a blank model is allowed and must not block submission.
  it('allows a preset provider to submit without a model', () => {
    const { container, onSubmit } = renderForm(
      makeFormData({ service_type: 'openai', model_name: '' })
    );

    fireEvent.submit(container.querySelector('form')!);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });
});

describe('ServiceForm — Ollama tool profile default', () => {
  function renderWithChange(formData: AiServiceSettingsFormInput) {
    const onFormDataChange = jest.fn();
    const utils = renderWithClient(
      <ServiceForm
        formData={formData}
        onFormDataChange={onFormDataChange}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        translationPrefix="settings.aiService.userSettings"
      />
    );
    return { ...utils, onFormDataChange };
  }

  async function pickServiceType(typeKey: string) {
    // The service_type SelectTrigger renders as role="combobox" with
    // id="service_type"; it is the first combobox in the form.
    const trigger = document.getElementById('service_type')!;
    fireEvent.click(trigger);
    const option = await screen.findByRole('option', {
      name: `settings.aiService.serviceTypes.${typeKey}`,
    });
    fireEvent.click(option);
  }

  // Tools default to 'full' for all services including Ollama.
  it('defaults chat_tool_profile to full when Ollama is selected', async () => {
    const { onFormDataChange } = renderWithChange(makeFormData());
    await pickServiceType('ollama');
    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({
        service_type: 'ollama',
        chat_tool_profile: 'full',
      })
    );
  });

  // Switching service type resets the profile to 'full'.
  it('resets chat_tool_profile to full when switching service types', async () => {
    const { onFormDataChange } = renderWithChange(
      makeFormData({ service_type: 'ollama', chat_tool_profile: 'core' })
    );
    await pickServiceType('anthropic');
    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({
        service_type: 'anthropic',
        chat_tool_profile: 'full',
      })
    );
  });
});

describe('ServiceForm — test connection button', () => {
  function renderWithTest(
    formData: AiServiceSettingsFormInput,
    {
      onTestConnection,
      testing,
      testStatus,
    }: {
      onTestConnection?: (model: string) => void;
      testing?: boolean;
      testStatus?:
        | { state: 'success' }
        | { state: 'error'; message: string }
        | null;
    } = {}
  ) {
    const onSubmit = jest.fn();
    const utils = renderWithClient(
      <ServiceForm
        formData={formData}
        onFormDataChange={jest.fn()}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
        translationPrefix="settings.aiService.userSettings"
        onTestConnection={onTestConnection}
        testing={testing}
        testStatus={testStatus}
      />
    );
    return { ...utils, onSubmit };
  }

  const testButton = (
    utils: ReturnType<typeof renderWithTest>
  ): HTMLElement | null =>
    utils.queryByRole('button', {
      name: /testConnection|\.testing$/,
    });

  it('does not render the button without the onTestConnection prop', () => {
    const utils = renderWithTest(makeFormData());
    expect(testButton(utils)).toBeNull();
  });

  it('renders the button when onTestConnection is provided', () => {
    const utils = renderWithTest(makeFormData(), {
      onTestConnection: jest.fn(),
    });
    expect(testButton(utils)).not.toBeNull();
  });

  it('fires onTestConnection (and not onSubmit) when clicked', () => {
    const onTestConnection = jest.fn();
    const utils = renderWithTest(makeFormData(), { onTestConnection });

    fireEvent.click(testButton(utils)!);

    expect(onTestConnection).toHaveBeenCalledTimes(1);
    expect(utils.onSubmit).not.toHaveBeenCalled();
  });

  it('disables the button while testing', () => {
    const utils = renderWithTest(makeFormData(), {
      onTestConnection: jest.fn(),
      testing: true,
    });
    expect((testButton(utils) as HTMLButtonElement).disabled).toBe(true);
  });

  // Same guard as submit: a no-preset type with no model can't be tested either.
  it('disables the button for a no-preset type with no model', () => {
    const utils = renderWithTest(
      makeFormData({
        service_type: 'openai_compatible',
        custom_url: 'http://localhost:1234/v1',
        showCustomModelInput: true,
        custom_model_name: '',
        model_name: '',
      }),
      { onTestConnection: jest.fn() }
    );
    expect((testButton(utils) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the success status text inline', () => {
    const utils = renderWithTest(makeFormData(), {
      onTestConnection: jest.fn(),
      testStatus: { state: 'success' },
    });
    expect(
      utils.getByText('settings.aiService.test.successTitle')
    ).toBeTruthy();
  });

  it('renders the failure status text with the error message inline', () => {
    const utils = renderWithTest(makeFormData(), {
      onTestConnection: jest.fn(),
      testStatus: { state: 'error', message: 'Bad API key' },
    });
    expect(
      utils.getByText('settings.aiService.test.failureTitle: Bad API key')
    ).toBeTruthy();
  });

  // The result is cleared while a fresh test is in flight.
  it('hides the status text while a test is running', () => {
    const utils = renderWithTest(makeFormData(), {
      onTestConnection: jest.fn(),
      testing: true,
      testStatus: { state: 'success' },
    });
    expect(
      utils.queryByText('settings.aiService.test.successTitle')
    ).toBeNull();
  });
});
