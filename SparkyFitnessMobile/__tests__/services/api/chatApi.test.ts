import {
  mapHistoryToInitialMessages,
  type ChatHistoryEntry,
} from '../../../src/services/api/chatApi';

const entry = (overrides: Partial<ChatHistoryEntry>): ChatHistoryEntry => ({
  id: 'id-1',
  message_type: 'user',
  content: 'hello',
  created_at: '2026-06-26T00:00:00.000Z',
  ...overrides,
});

describe('mapHistoryToInitialMessages', () => {
  it('returns an empty array for empty input', () => {
    expect(mapHistoryToInitialMessages([])).toEqual([]);
  });

  it('maps user and assistant roles and preserves ids', () => {
    const result = mapHistoryToInitialMessages([
      entry({ id: 'user-id', message_type: 'user', content: 'hi' }),
      entry({ id: 'assistant-id', message_type: 'assistant', content: 'hey' }),
    ]);
    expect(result).toMatchObject([
      { id: 'user-id', role: 'user', content: 'hi' },
      { id: 'assistant-id', role: 'assistant', content: 'hey' },
    ]);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    'invalid',
    [null, 1, { type: 'text', text: 123 }],
  ])('falls back to content for unusable parts: %j', (parts) => {
    const [result] = mapHistoryToInitialMessages([
      entry({ content: 'keep me', parts }),
    ]);
    expect(result.parts).toEqual([{ type: 'text', text: 'keep me' }]);
    expect(result.content).toBe('keep me');
  });

  it('preserves text-only parts', () => {
    const parts = [
      { type: 'text', text: 'one' },
      { type: 'text', text: 'two' },
    ];
    const [result] = mapHistoryToInitialMessages([
      entry({ content: 'fallback', parts }),
    ]);
    expect(result.parts).toEqual(parts);
  });

  it.each([
    { type: 'image', image: 'data:image/png;base64,IMAGE' },
    { type: 'image_url', image_url: 'data:image/png;base64,IMAGE' },
    { type: 'image_url', image_url: { url: 'data:image/png;base64,IMAGE' } },
    {
      type: 'file',
      data: 'data:image/png;base64,IMAGE',
      mediaType: 'image/png',
    },
    {
      type: 'file',
      url: 'data:image/png;base64,IMAGE',
      mediaType: 'image/png',
    },
    { type: 'file', url: 'data:image/png;base64,IMAGE', mimeType: 'image/png' },
  ])('normalizes persisted image formats alongside text: %j', (image) => {
    const [result] = mapHistoryToInitialMessages([
      entry({
        content: 'caption',
        parts: [{ type: 'text', text: 'caption' }, image],
      }),
    ]);
    expect(result.parts).toEqual([
      { type: 'text', text: 'caption' },
      {
        type: 'file',
        mediaType: 'image/png',
        url: 'data:image/png;base64,IMAGE',
      },
    ]);
  });

  it('preserves image-only turns and filenames without adding a text placeholder', () => {
    const [result] = mapHistoryToInitialMessages([
      entry({
        content: '[Image message]',
        parts: [
          {
            type: 'file',
            data: 'data:image/jpeg;base64,IMAGE',
            mediaType: 'image/jpeg',
            filename: ' lunch.jpg ',
          },
        ],
      }),
    ]);
    expect(result.parts).toEqual([
      {
        type: 'file',
        mediaType: 'image/jpeg',
        url: 'data:image/jpeg;base64,IMAGE',
        filename: 'lunch.jpg',
      },
    ]);
  });

  it('removes the synthetic text placeholder when an image is present', () => {
    const [result] = mapHistoryToInitialMessages([
      entry({
        content: '[Image message]',
        parts: [
          { type: 'text', text: '[Image message]' },
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/menu.WEBP?size=1024#image' },
          },
        ],
      }),
    ]);
    expect(result.parts).toEqual([
      {
        type: 'file',
        mediaType: 'image/webp',
        url: 'https://example.com/menu.WEBP?size=1024#image',
      },
    ]);
  });

  it('keeps placeholder text when its image is unavailable', () => {
    const [result] = mapHistoryToInitialMessages([
      entry({
        content: '[Image message]',
        parts: [
          { type: 'text', text: '[Image message]' },
          { type: 'file', mediaType: 'image/jpeg' },
        ],
      }),
    ]);
    expect(result.parts).toEqual([{ type: 'text', text: '[Image message]' }]);
  });

  it('ignores malformed or non-image parts without dropping valid text', () => {
    const [result] = mapHistoryToInitialMessages([
      entry({
        content: 'fallback',
        parts: [
          null,
          { type: 'text', text: 'caption' },
          { type: 'text', text: '   ' },
          { type: 'unknown' },
          {
            type: 'file',
            mediaType: 'application/pdf',
            url: 'https://example.com/a.pdf',
          },
          { type: 'image', image: '   ' },
          { type: 'image_url', image_url: { url: 42 } },
        ],
      }),
    ]);
    expect(result.parts).toEqual([{ type: 'text', text: 'caption' }]);
  });

  it('falls back to distinct index-based ids for missing row ids', () => {
    const result = mapHistoryToInitialMessages([
      entry({ id: '' }),
      entry({ id: '' }),
    ]);
    expect(result.map((message) => message.id)).toEqual([
      'history-0',
      'history-1',
    ]);
  });
});
