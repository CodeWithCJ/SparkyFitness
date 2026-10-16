import { act, renderHook } from '@testing-library/react';
import { useVoiceInput } from '@/hooks/AI/useVoiceInput';
import { BrowserVoiceInput } from '@/utils/browserVoiceInput';

type Callbacks = ConstructorParameters<typeof BrowserVoiceInput>[0];
let mockCallbacks: Callbacks;
const mockStart = jest.fn();
const mockCancel = jest.fn();
const mockStop = jest.fn();
jest.mock('@/utils/browserVoiceInput', () => ({
  BrowserVoiceInput: jest.fn().mockImplementation((callbacks: Callbacks) => {
    mockCallbacks = callbacks;
    return { start: mockStart, cancel: mockCancel, stop: mockStop };
  }),
}));
jest.mock('@/api/Chatbot/voiceTranscription', () => ({
  transcribeVoiceRecording: jest.fn(),
}));

let draft = '';
const setText = jest.fn((text: string) => {
  draft = text;
});
const options = {
  enabled: true,
  serviceId: null as string | null,
  language: 'en',
  getText: () => draft,
  setText,
  onLevel: jest.fn(),
};
beforeEach(() => {
  jest.clearAllMocks();
  draft = 'Please';
});

it('only appends text to the editable draft, with no send callback', () => {
  const { result } = renderHook(() => useVoiceInput(options));
  act(() => result.current.start());
  expect(mockStart).toHaveBeenCalledWith(null, 'en');
  act(() => mockCallbacks.onTranscript('log an apple'));
  expect(setText).toHaveBeenCalledWith('Please log an apple');
});

it('never overwrites a draft changed while recognition is pending', () => {
  const { result } = renderHook(() => useVoiceInput(options));
  act(() => result.current.start());
  draft = 'A different message';
  act(() => mockCallbacks.onTranscript('late transcript'));
  expect(setText).not.toHaveBeenCalled();
});

it('cancels when voice is disabled or the provider changes', () => {
  const { result, rerender } = renderHook((props) => useVoiceInput(props), {
    initialProps: options,
  });
  act(() => result.current.start());
  rerender({ ...options, serviceId: 'voice-model' });
  expect(mockCancel).toHaveBeenCalledTimes(1);
  rerender({ ...options, enabled: false });
  expect(mockCancel).toHaveBeenCalledTimes(2);
  act(() => result.current.start());
  expect(mockStart).toHaveBeenCalledTimes(1);
});

it('cancels on Escape, pagehide, and a hidden document', () => {
  renderHook(() => useVoiceInput(options));
  act(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  );
  act(() => window.dispatchEvent(new Event('pagehide')));
  const descriptor = Object.getOwnPropertyDescriptor(
    document,
    'visibilityState'
  );
  try {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(mockCancel).toHaveBeenCalledTimes(3);
  } finally {
    if (descriptor)
      Object.defineProperty(document, 'visibilityState', descriptor);
    else Reflect.deleteProperty(document, 'visibilityState');
  }
});

it('cancels on unmount and rejects late transcripts', () => {
  const { result, unmount } = renderHook(() => useVoiceInput(options));
  act(() => result.current.start());
  unmount();
  expect(mockCancel).toHaveBeenCalled();
  act(() => mockCallbacks.onTranscript('late transcript'));
  expect(setText).not.toHaveBeenCalled();
});
