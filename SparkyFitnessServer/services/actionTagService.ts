import { log } from '../config/logging.js';
import {
  claimActionTagRun,
  getActionTagByCode,
  releaseActionTagRun,
} from '../models/actionTagRepository.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import measurementService from './measurementService.js';
import {
  ACTION_TAG_DEBOUNCE_SECONDS,
  type ScanActionTagBody,
  type ScanActionTagResponse,
  type TagAction,
  type TagActionType,
} from '@workspace/shared';

type RunnerContext = {
  userId: string;
  authenticatedUserId: string;
  entryDate: string;
};

/** `null` means the thing the tag points at no longer exists; nothing was logged. */
type RunnerResult = { summary: string } | null;

type Runner<T extends TagAction> = (
  context: RunnerContext,
  action: T
) => Promise<RunnerResult>;

// One runner per action type. The mapped type makes adding a type to
// tagActionSchema without a runner here a compile error.
const RUNNERS: {
  [K in TagActionType]: Runner<Extract<TagAction, { type: K }>>;
} = {
  water: async (context, action) => {
    // upsertWaterIntake falls back to a default 250 ml for an unknown
    // container without saying so, so a deleted container is checked here.
    const container = await waterContainerRepository.getWaterContainerById(
      action.container_id,
      context.userId
    );
    if (!container) return null;
    await measurementService.upsertWaterIntake(
      context.userId,
      context.authenticatedUserId,
      context.entryDate,
      action.drinks,
      action.container_id
    );
    return { summary: `${action.drinks} × ${container.name}` };
  },
};

function runAction(
  context: RunnerContext,
  action: TagAction
): Promise<RunnerResult> {
  // The cast keeps the lookup type-safe per member of the union.
  const runner = RUNNERS[action.type] as Runner<TagAction>;
  return runner(context, action);
}

/**
 * Runs the action saved for a tag code. Never logs for a code that is not bound
 * to this person, so another person's sticker cannot write into this account.
 */
export async function scanActionTag(
  userId: string,
  authenticatedUserId: string,
  body: ScanActionTagBody
): Promise<ScanActionTagResponse> {
  const tag = await getActionTagByCode(
    userId,
    body.tag_code,
    authenticatedUserId
  );
  if (!tag) return { status: 'unknown_tag', tag: null, summary: null };

  if (tag.ask_before_running && !body.confirmed) {
    return { status: 'needs_confirmation', tag, summary: null };
  }

  const claim = await claimActionTagRun(
    userId,
    tag.id,
    ACTION_TAG_DEBOUNCE_SECONDS,
    authenticatedUserId
  );
  if (!claim) return { status: 'too_soon', tag, summary: null };

  try {
    const result = await runAction(
      { userId, authenticatedUserId, entryDate: body.entry_date },
      tag.action
    );
    if (!result) {
      await releaseActionTagRun(userId, tag.id, claim, authenticatedUserId);
      return { status: 'target_missing', tag, summary: null };
    }
    return { status: 'done', tag, summary: result.summary };
  } catch (error) {
    await releaseActionTagRun(userId, tag.id, claim, authenticatedUserId).catch(
      (releaseError: unknown) =>
        log('warn', 'Could not release the tag run claim:', releaseError)
    );
    throw error;
  }
}
