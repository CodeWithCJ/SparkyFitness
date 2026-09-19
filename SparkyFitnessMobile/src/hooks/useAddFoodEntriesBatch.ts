import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  createFoodEntry,
  type CreateFoodEntryPayload,
} from '../services/api/foodEntriesApi';
import { ApiError } from '../services/api/errors';
import { runTasksInBatches } from '../utils/concurrency';
import {
  partitionDrafts,
  type MultiAddDraft,
} from '../utils/multiAddFoodEntries';
import { dailySummaryQueryKey, foodsQueryKey } from './queryKeys';
import { useFoodSearchSelectionStore } from '../stores/foodSearchSelectionStore';
import type { RowOutcomeStatus } from './useFoodSearchSelection';

/** Matches the health-sync orchestrators' fan-out width (see AGENTS.md);
 * bounded so a 50-item basket cannot open 50 simultaneous requests. */
const BATCH_CONCURRENCY = 4;

export interface RowOutcome {
  key: string;
  status: RowOutcomeStatus;
}

export interface BatchSubmitResult {
  succeededKeys: string[];
  /** Confirmed-rejected and unknown outcomes only — a 'succeeded' row is
   * reported via succeededKeys instead, since the caller removes it. */
  outcomes: RowOutcome[];
  /** Rows partitionDrafts rejected before any request was made (never sent,
   * kept separate from API outcomes per the batch milestone design). */
  invalidKeys: string[];
  /** True when a 401 halted the batch; rows after the halt were left
   * unstarted (no outcome — they retry normally once reauthenticated). */
  authHalted: boolean;
}

function isAuthFailure(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 401;
}

function isConfirmedRejection(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  );
}

/**
 * Submits a batch of multi-add drafts, one POST per row through the existing
 * single-entry API (no server batch endpoint in v1 — see plan's named
 * trade-off). Modeled on useAddFoodEntry (payload shape) and
 * useCopyFamilyFoodEntries (cache invalidation, toast-on-success), but the
 * per-row outcome handling here has no analog in either: a family copy is one
 * atomic request, so it never has partial results to reconcile.
 */
export function useAddFoodEntriesBatch() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  // The latch lives in the selection store, not this hook: a remounted
  // review screen gets a fresh hook instance, and the duplicate-press guard
  // it inherits expires after 700ms — an unknown request from this batch may
  // still commit server-side long after that. The store flag also locks all
  // basket/draft mutations for the flight's duration, and is the single
  // source of truth the screens render from.
  const isSubmitting = useFoodSearchSelectionStore((s) => s.isSubmitting);

  const submitBatch = useCallback(
    async (drafts: MultiAddDraft[]): Promise<BatchSubmitResult | null> => {
      if (
        useFoodSearchSelectionStore.getState().isSubmitting ||
        drafts.length === 0
      ) {
        return null;
      }
      useFoodSearchSelectionStore.getState().setSubmitting(true);
      // Captured so an identity-change cancelBatch() mid-flight can discard
      // this batch's reconciliation entirely (the requests still run out,
      // but their outcomes never land in the next account's cleared basket).
      const batchGeneration =
        useFoodSearchSelectionStore.getState().batchGeneration;

      try {
        const { ok, invalid } = partitionDrafts(drafts);
        const date = drafts[0]?.entryDate;

        // Async worker: a thrown error (sync or async) becomes a rejection
        // inside Promise.allSettled rather than crashing the batch loop.
        const submitOne = async (item: {
          key: string;
          payload: CreateFoodEntryPayload;
        }): Promise<RowOutcome> => {
          try {
            await createFoodEntry(item.payload);
            return { key: item.key, status: 'succeeded' };
          } catch (error) {
            if (isAuthFailure(error)) {
              // Reject so stopOnError halts unstarted batches below; this
              // row's own outcome (a definite 401) is still recorded as
              // confirmed_rejected once the rejection is unpacked.
              throw error;
            }
            if (isConfirmedRejection(error)) {
              return { key: item.key, status: 'confirmed_rejected' };
            }
            // Timeout, network failure, or 5xx: the request may have
            // committed server-side. Never auto-retried.
            return { key: item.key, status: 'unknown' };
          }
        };

        const settled = await runTasksInBatches(
          ok,
          BATCH_CONCURRENCY,
          submitOne,
          {
            stopOnError: isAuthFailure,
          }
        );

        // Identity changed mid-flight (cancelBatch): the basket this batch
        // was reconciling into is gone. Drop the results — the requests have
        // already run out against the old account and their outcomes must
        // not surface under the new one.
        if (
          batchGeneration !==
          useFoodSearchSelectionStore.getState().batchGeneration
        ) {
          return null;
        }

        const succeededKeys: string[] = [];
        const outcomes: RowOutcome[] = [];
        let authHalted = false;

        settled.forEach((result, index) => {
          const key = ok[index].key;
          if (result.status === 'fulfilled') {
            if (result.value.status === 'succeeded') {
              succeededKeys.push(key);
            } else {
              outcomes.push(result.value);
            }
          } else if (result.status === 'rejected') {
            // Only an auth failure rejects submitOne (see above); any other
            // unexpected rejection is treated conservatively as unknown
            // rather than assumed confirmed.
            authHalted = authHalted || isAuthFailure(result.reason);
            outcomes.push({
              key,
              status: isAuthFailure(result.reason)
                ? 'confirmed_rejected'
                : 'unknown',
            });
          }
          // status === 'skipped': left unstarted by the auth halt. No
          // outcome recorded — the row retries normally next attempt.
        });

        // Invalidate even with zero confirmed successes: an unknown outcome
        // (timeout/network/5xx) may still have committed server-side.
        if (date) {
          queryClient.invalidateQueries({
            queryKey: dailySummaryQueryKey(date),
          });
        }
        queryClient.invalidateQueries({ queryKey: [...foodsQueryKey] });

        if (succeededKeys.length > 0) {
          Toast.show({
            type: 'success',
            text1: t('foodEntryMultiAdd.toasts.added', {
              defaultValue: 'Added {{count}} foods',
              defaultValue_one: 'Added {{count}} food',
              defaultValue_other: 'Added {{count}} foods',
              count: succeededKeys.length,
            }),
          });
        }

        return {
          succeededKeys,
          outcomes,
          invalidKeys: invalid.map((row) => row.key),
          authHalted,
        };
      } finally {
        // Release the latch only if this batch still owns it. After a
        // cancelBatch the generation moved on: the latch is either already
        // released, or — if a replacement batch has since started — it
        // belongs to THAT batch, and releasing it here would cut the
        // replacement's flight short. Reconciliation unlock still works
        // because the non-canceled path always matches its own generation.
        const store = useFoodSearchSelectionStore.getState();
        if (store.batchGeneration === batchGeneration) {
          store.setSubmitting(false);
        }
      }
    },
    [queryClient, t]
  );

  return { submitBatch, isSubmitting };
}
