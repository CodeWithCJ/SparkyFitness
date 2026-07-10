import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const chatScreen = readSource('src/screens/ChatScreen.tsx');
const typingIndicator = readSource('src/components/chat/TypingIndicator.tsx');
const chatConstants = readSource('src/constants/chat.ts');
const source = [chatScreen, typingIndicator, chatConstants].join('\n');

describe('chat shell localization contract', () => {
  it('localizes recovery, actions, composer, empty state, and config gates', () => {
    for (const key of [
      'chat.errorTitle',
      'chat.retry',
      'chat.copy',
      'chat.composerPlaceholder',
      'chat.emptyDescription',
      'chat.clearTitle',
      'chat.noServer',
      'chat.noProvider',
      'chat.typing',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('keeps provider failures out of visible recovery copy', () => {
    expect(chatScreen).toContain("text2: mobileT('chat.errorDescription')");
    expect(chatScreen).not.toContain("text2: error?.message ||");
    expect(chatScreen).not.toContain('<ErrorPrimitive.Message');
  });

  it('uses semantic RTL spacing and Arabic starter prompts', () => {
    expect(chatScreen).toContain('ms-1');
    expect(chatScreen).toContain('me-1');
    expect(chatConstants).toContain("mobileT('chat.suggestion.breakfast')");
  });

  it('does not leave visible English chat chrome behind', () => {
    for (const englishCopy of [
      '>Retry<',
      "'Copied' : 'Copy'",
      'Message Sparky…',
      'Ask Sparky anything about',
      "'Clear chat'",
      "accessibilityLabel: 'Clear chat'",
      'No active server config.',
      'No active AI provider.',
      'accessibilityLabel="Sparky is typing"',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
