import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionTagResponse } from '@workspace/shared';
import * as repo from '../models/actionTagRepository.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import measurementService from '../services/measurementService.js';
import { scanActionTag } from '../services/actionTagService.js';

vi.mock('../models/actionTagRepository.js', () => ({
  getActionTagByCode: vi.fn(),
  claimActionTagRun: vi.fn(),
  releaseActionTagRun: vi.fn(),
}));

vi.mock('../models/waterContainerRepository.js', () => ({
  default: { getWaterContainerById: vi.fn() },
}));

vi.mock('../services/measurementService.js', () => ({
  default: { upsertWaterIntake: vi.fn() },
}));

const TAG_CODE = 'a'.repeat(32);
const USER = 'user-1';
const BODY = { tag_code: TAG_CODE, entry_date: '2026-10-30' };

function tag(overrides: Partial<ActionTagResponse> = {}): ActionTagResponse {
  return {
    id: 'tag-1',
    tag_code: TAG_CODE,
    label: 'Stanley',
    action: { type: 'water', container_id: 7, drinks: 1 },
    ask_before_running: false,
    last_run_at: null,
    created_at: '2026-10-30T00:00:00.000Z',
    updated_at: '2026-10-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('scanActionTag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.releaseActionTagRun).mockResolvedValue(undefined);
    vi.mocked(repo.claimActionTagRun).mockResolvedValue({
      previousRunAt: null,
      claimedAt: new Date('2026-10-30T12:00:00.000Z'),
    });
    vi.mocked(waterContainerRepository.getWaterContainerById).mockResolvedValue(
      { id: 7, name: 'Stanley (1 L)' } as Awaited<
        ReturnType<typeof waterContainerRepository.getWaterContainerById>
      >
    );
  });

  it('logs nothing for an unknown code', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(null);
    const result = await scanActionTag(USER, USER, BODY);
    expect(result).toEqual({ status: 'unknown_tag', tag: null, summary: null });
    expect(repo.claimActionTagRun).not.toHaveBeenCalled();
    expect(measurementService.upsertWaterIntake).not.toHaveBeenCalled();
  });

  it('logs the drinks of a water tag', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ action: { type: 'water', container_id: 7, drinks: 2 } })
    );
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('done');
    expect(result.summary).toBe('2 × Stanley (1 L)');
    expect(measurementService.upsertWaterIntake).toHaveBeenCalledWith(
      USER,
      USER,
      '2026-10-30',
      2,
      7
    );
  });

  it('asks first when the tag requires it, without claiming a run', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ ask_before_running: true })
    );
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('needs_confirmation');
    expect(repo.claimActionTagRun).not.toHaveBeenCalled();
    expect(measurementService.upsertWaterIntake).not.toHaveBeenCalled();
  });

  it('runs a confirmed tag that asks first', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(
      tag({ ask_before_running: true })
    );
    const result = await scanActionTag(USER, USER, {
      ...BODY,
      confirmed: true,
    });
    expect(result.status).toBe('done');
  });

  it('drops a double read', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(tag());
    vi.mocked(repo.claimActionTagRun).mockResolvedValue(null);
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('too_soon');
    expect(measurementService.upsertWaterIntake).not.toHaveBeenCalled();
  });

  it('reports a deleted container, logs nothing and releases the claim', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(tag());
    vi.mocked(waterContainerRepository.getWaterContainerById).mockResolvedValue(
      null
    );
    const result = await scanActionTag(USER, USER, BODY);
    expect(result.status).toBe('target_missing');
    expect(measurementService.upsertWaterIntake).not.toHaveBeenCalled();
    expect(repo.releaseActionTagRun).toHaveBeenCalledOnce();
  });

  it('releases the claim and rethrows when the action fails', async () => {
    vi.mocked(repo.getActionTagByCode).mockResolvedValue(tag());
    vi.mocked(measurementService.upsertWaterIntake).mockRejectedValue(
      new Error('db down')
    );
    await expect(scanActionTag(USER, USER, BODY)).rejects.toThrow('db down');
    expect(repo.releaseActionTagRun).toHaveBeenCalledOnce();
  });
});
