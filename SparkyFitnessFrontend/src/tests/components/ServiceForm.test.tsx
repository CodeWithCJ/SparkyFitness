import { fireEvent } from '@testing-library/react';
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
