import {
  mapHistoryToInitialMessages,
  type ChatHistoryEntry,
} from '../../../src/services/api/chatApi';

// The mapper is pure; importing chatApi must not pull in the assistant-ui
// runtime (the `useChatRuntime` reference is a type-only import).

type MappedMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: { type: string; text?: string }[];
};

const entry = (over: Partial<ChatHistoryEntry>): ChatHistoryEntry => ({
  id: 'id-1',
  message_type: 'user',
  content: 'hello',
  created_at: '2026-06-26T00:00:00.000Z',
  ...over,
});

describe('mapHistoryToInitialMessages', () => {
  it('returns an empty array for empty input', () => {
    expect(mapHistoryToInitialMessages([])).toEqual([]);
  });

  it('maps user/assistant message_type to role', () => {
    const result = mapHistoryToInitialMessages([
      entry({ message_type: 'user', content: 'hi' }),
      entry({ message_type: 'assistant', content: 'hey' }),
    ]) as unknown as MappedMessage[];

    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
  });

  it('builds a text part from content when parts are absent', () => {
    const result = mapHistoryToInitialMessages([
      entry({ content: 'just text' }),
    ]) as unknown as MappedMessage[];

    expect(result[0].parts).toEqual([{ type: 'text', text: 'just text' }]);
    expect(result[0].content).toBe('just text');
  });

  it('passes through parts when they are a text-only array', () => {
    const parts = [
      { type: 'text', text: 'one' },
      { type: 'text', text: 'two' },
    ];
    const result = mapHistoryToInitialMessages([
      entry({ content: 'fallback', parts }),
    ]) as unknown as MappedMessage[];

    expect(result[0].parts).toBe(parts);
  });

  it('falls back to content when parts contain a non-text part', () => {
    const result = mapHistoryToInitialMessages([
      entry({
        content: 'surrounding text',
        parts: [
          { type: 'text', text: 'caption' },
          { type: 'image', image: 'data:image/png;base64,xxx' },
        ],
      }),
    ]) as unknown as MappedMessage[];

    expect(result[0].parts).toEqual([{ type: 'text', text: 'surrounding text' }]);
  });

  it('falls back to content for an empty parts array (no parts dropped)', () => {
    const result = mapHistoryToInitialMessages([
      entry({ content: 'keep me', parts: [] }),
    ]) as unknown as MappedMessage[];

    expect(result[0].parts).toEqual([{ type: 'text', text: 'keep me' }]);
  });

  it('falls back to an index-based id when the row id is missing', () => {
    const result = mapHistoryToInitialMessages([
      entry({ id: '', content: 'a' }),
      entry({ id: '', content: 'b' }),
    ]) as unknown as MappedMessage[];

    expect(result[0].id).toBe('history-0');
    expect(result[1].id).toBe('history-1');
  });

  it('keeps a present id', () => {
    const result = mapHistoryToInitialMessages([
      entry({ id: 'real-id' }),
    ]) as unknown as MappedMessage[];

    expect(result[0].id).toBe('real-id');
  });
});
