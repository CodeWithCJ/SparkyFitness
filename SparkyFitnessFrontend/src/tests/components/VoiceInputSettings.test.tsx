import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VoiceInputSettings } from '@/components/ai/VoiceInputSettings';
import type { VoiceServiceOption } from '@workspace/shared';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));
const chatService: VoiceServiceOption = {
  id: 'chat-model',
  service_name: 'Chat model',
  service_type: 'google',
  model_name: 'gemini-2.5-flash',
  is_active: true,
  supports_audio_input: true,
};
const services: VoiceServiceOption[] = [
  { ...chatService, id: 'other', service_name: 'Other model' },
  chatService,
  {
    ...chatService,
    id: 'disabled',
    service_name: 'Disabled',
    is_active: false,
  },
  {
    ...chatService,
    id: 'text',
    service_name: 'Text only',
    supports_audio_input: false,
  },
  {
    ...chatService,
    id: 'unsupported',
    service_name: 'Unsupported transport',
    service_type: 'openrouter',
  },
];
const onChange = jest.fn();
const props = { services, chatServiceId: chatService.id, onChange };
beforeEach(() => jest.clearAllMocks());

async function chooseAi() {
  fireEvent.pointerDown(screen.getByLabelText('Recognition'));
  fireEvent.click(
    await screen.findByRole('option', { name: 'AI transcription' })
  );
}

it('defaults to System even when the chat model supports audio', () => {
  render(
    <VoiceInputSettings
      {...props}
      preferences={{ active_voice_ai_service_id: null }}
    />
  );
  expect(screen.getByLabelText('Recognition')).toHaveTextContent(
    'System (default)'
  );
  expect(screen.queryByLabelText('Voice model')).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

it('requires explicit AI model selection, suggesting the chat model first', async () => {
  render(
    <VoiceInputSettings
      {...props}
      preferences={{ active_voice_ai_service_id: null }}
    />
  );
  await chooseAi();
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Voice model')).toHaveTextContent(
    'Choose a model'
  );
  fireEvent.pointerDown(screen.getByLabelText('Voice model'));
  const options = await screen.findAllByRole('option');
  expect(options).toHaveLength(2);
  expect(options[0]).toHaveTextContent(
    'Chat model — gemini-2.5-flash (Used for chat)'
  );
  fireEvent.click(options[0]!);
  expect(onChange).toHaveBeenCalledWith(
    { active_voice_ai_service_id: 'chat-model' },
    expect.any(Function)
  );
  // Stay on the AI choice while the server is saving; do not flash System.
  expect(screen.getByLabelText('Recognition')).toHaveTextContent(
    'AI transcription'
  );
});

it('turns voice off without clearing the explicit model selection', () => {
  const { rerender } = render(
    <VoiceInputSettings
      {...props}
      preferences={{
        active_voice_ai_service_id: 'chat-model',
        voice_input_enabled: true,
      }}
    />
  );
  fireEvent.click(screen.getByRole('switch', { name: 'Voice input' }));
  expect(onChange).toHaveBeenCalledWith({ voice_input_enabled: false });
  rerender(
    <VoiceInputSettings
      {...props}
      preferences={{
        active_voice_ai_service_id: 'chat-model',
        voice_input_enabled: false,
      }}
    />
  );
  expect(screen.queryByLabelText('Recognition')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('switch', { name: 'Voice input' }));
  expect(onChange).toHaveBeenLastCalledWith({ voice_input_enabled: true });
});

it('uses an explicit null to return to System', async () => {
  render(
    <VoiceInputSettings
      {...props}
      preferences={{ active_voice_ai_service_id: 'chat-model' }}
    />
  );
  fireEvent.pointerDown(screen.getByLabelText('Recognition'));
  fireEvent.click(
    await screen.findByRole('option', { name: 'System (default)' })
  );
  expect(onChange).toHaveBeenCalledWith({ active_voice_ai_service_id: null });
});

it('explains the missing-model case without opting in to any provider', async () => {
  render(<VoiceInputSettings {...props} services={[]} preferences={{}} />);
  await chooseAi();
  expect(screen.getByRole('status')).toHaveTextContent(
    'No compatible voice models'
  );
  expect(screen.getByLabelText('Voice model')).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
});

it('does not change modes or models before preferences load', () => {
  render(<VoiceInputSettings {...props} preferences={undefined} />);
  expect(screen.getByRole('switch')).toBeDisabled();
  expect(screen.getByLabelText('Recognition')).toBeDisabled();
});
