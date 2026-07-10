import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const toolCard = fs.readFileSync(
  path.join(mobileRoot, 'src/components/chat/ToolCallCard.tsx'),
  'utf8',
);
const chatConstants = fs.readFileSync(
  path.join(mobileRoot, 'src/constants/chat.ts'),
  'utf8',
);

describe('chat tool localization contract', () => {
  it('localizes known, lookup, search, and fallback tool labels', () => {
    for (const key of [
      'chat.tool.manageFood',
      'chat.tool.foodDiary',
      'chat.tool.searchFoods',
      'chat.tool.generic',
    ]) {
      expect(chatConstants).toContain(`mobileT('${key}'`);
    }
  });

  it('announces localized status and expansion state', () => {
    expect(toolCard).toContain("mobileT(`chat.tool.status.${status}`");
    expect(toolCard).toContain('accessibilityState={{ expanded }}');
    expect(toolCard).toContain("mobileT('chat.tool.expandHint')");
    expect(toolCard).toContain("mobileT('chat.tool.collapseHint')");
  });

  it('uses the RTL disclosure direction without changing raw results', () => {
    expect(toolCard).toContain("isMobileRtl ? 'chevron-back' : 'chevron-forward'");
    expect(toolCard).toContain('text={part.result as string}');
    expect(toolCard).toContain('JSON.stringify(part.result, null, 2)');
  });

  it('does not expose English labels or raw fallback tool names', () => {
    for (const englishCopy of [
      "label: 'Food'",
      '`Looked up ${',
      'return { label: humanize(',
    ]) {
      expect(chatConstants).not.toContain(englishCopy);
    }
  });
});
