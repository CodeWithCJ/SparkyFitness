import { beforeEach, expect, it, vi } from 'vitest';
import * as diary from '../services/foodAssistantDiaryService.js';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';
import { buildDiaryTools } from '../ai/tools/diaryTools.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';
vi.mock('../services/foodAssistantDiaryService.js', () => ({
  inspectDiary: vi.fn(),
  applyDiary: vi.fn(),
  undoDiary: vi.fn(),
}));
const id = 'fd7accb6-1fbb-400e-80c3-c16808ab7772';
const undo = {
  operation_id: id,
  diary_operation_id: id,
  expected_version: 2,
  source_quote: 'Undo lunch',
};
beforeEach(() => vi.clearAllMocks());
it('gives MCP an owner review link without accepting the model quote as consent', async () => {
  vi.mocked(diary.undoDiary).mockRejectedValue(
    new FoodAssistantConflict('Undo needs an explicit current user request.')
  );
  const tool = buildDiaryTools('owner').sparky_manage_diary;
  const result = await tool.execute!(
    { action: 'undo', task_id: id, undo },
    toolOpts
  );
  expect(result).toContain('diary-confirmation#');
  expect(result).toContain('Nothing was changed');
  expect(diary.undoDiary).toHaveBeenCalledWith(
    'owner',
    id,
    expect.objectContaining({
      operation_id: id,
      source_quote: 'Undo these diary changes.',
    }),
    undefined
  );
});
it('keeps trusted chat confirmation and persisted MCP retries working', async () => {
  vi.mocked(diary.undoDiary).mockResolvedValue({ id } as Awaited<
    ReturnType<typeof diary.undoDiary>
  >);
  const chat = buildDiaryTools('owner', {
    latestUserText: 'Undo lunch',
  }).sparky_manage_diary;
  expect(
    await chat.execute!({ action: 'undo', task_id: id, undo }, toolOpts)
  ).toContain(id);
  expect(diary.undoDiary).toHaveBeenLastCalledWith(
    'owner',
    id,
    undo,
    'Undo lunch'
  );
  const mcp = buildDiaryTools('owner').sparky_manage_diary;
  expect(
    await mcp.execute!({ action: 'undo', task_id: id, undo }, toolOpts)
  ).toContain(id);
});
