import { useEffect, useRef } from 'react';
import { clientRequestIdSchema } from '@workspace/shared';
import WatchConnectivity, {
  type WatchContextPayload,
  type WatchFastEndRequestPayload,
  type WatchFastStartRequestPayload,
  type WatchServerSyncedPayload,
} from '../../modules/watch-connectivity';
import type { FastingLog } from '../types/fasting';
import { FASTING_PRESETS } from '../constants/fasting';
import {
  endFast,
  fetchCurrentFast,
  startFast,
} from '../services/api/fastingApi';
import { cancelFastGoalNotification } from './useFasting';
import { fastingRootQueryKey } from './queryKeys';
import { queryClient } from './queryClient';
import { addLog } from '../services/LogService';
import { ApiError } from '../services/api/errors';
import { getActiveServerConfigId } from '../services/storage';
import {
  isPayloadForActiveServer,
  resolveWatchServerConfig,
} from '../services/watchServerCredentials';
import { isPermanentWatchClientRejection } from './useWatchCheckInBridge';
import {
  isTerminalFast,
  parseCurrentWatchFast,
  toWatchFast,
} from '../utils/watchFast';

const MAX_SETTLED_FAST_IDS = 100;

type RetryingStartEntry = {
  clientId: string;
  startedAt: number | null;
  recordedAt: number;
};

type DeferredEndEntry = {
  payload: WatchFastEndRequestPayload;
  blockedByStartIds: Set<string>;
  remainingOriginalStartIds: Set<string>;
  confirmedFastIds: Set<string>;
  hasConfirmedOriginalStart: boolean;
  supersededByStartPrune: boolean;
};

/**
 * Starts or ends a fast when the wearer asks from the watch's Fasting page.
 * The next context push carries the new fast back, so the watch updates once
 * the server has it. A request is handled once per `clientId`.
 */
export function useWatchFastingBridge(enabled: boolean): void {
  const inFlightRef = useRef(new Set<string>());
  const settledRef = useRef(new Map<string, boolean>());
  const ownerQueueRef = useRef(new Map<string, Promise<void>>());
  const retryingStartsByOwnerRef = useRef(
    new Map<string, Map<string, RetryingStartEntry>>()
  );
  const deferredEndsByOwnerRef = useRef(new Map<string, DeferredEndEntry[]>());

  useEffect(() => {
    const watch = WatchConnectivity;
    if (!enabled || !watch?.isSupported()) return;

    const resolveEffectiveOwner = async (
      ownerId?: string
    ): Promise<string | null> => {
      const explicit = ownerId?.trim() ?? '';
      const active = (await getActiveServerConfigId())?.trim() ?? '';
      if (explicit !== '') {
        if (active === '' || explicit !== active) return null;
        return explicit;
      }
      return active;
    };

    let dispatchTail: Promise<void> = Promise.resolve();
    const scheduleWithResolvedOwner = (
      ownerId: string | undefined,
      onResolved: (resolvedOwner: string) => void
    ): Promise<void> => {
      const step = dispatchTail.then(async () => {
        const resolvedOwner = await resolveEffectiveOwner(ownerId);
        if (resolvedOwner === null) return;
        onResolved(resolvedOwner);
      });
      dispatchTail = step.catch(() => undefined);
      return step;
    };

    const recordSettled = (dedupeKey: string, ok: boolean) => {
      if (!dedupeKey) return;
      settledRef.current.delete(dedupeKey);
      settledRef.current.set(dedupeKey, ok);
      if (settledRef.current.size > MAX_SETTLED_FAST_IDS) {
        const oldest = settledRef.current.keys().next().value;
        if (oldest !== undefined) {
          settledRef.current.delete(oldest);
        }
      }
    };

    const sendAckWithFast = async (
      clientId: string,
      ok: boolean,
      fastKnown: boolean,
      fast: WatchContextPayload['fast']
    ) => {
      if (watch.sendFastAck) {
        await watch.sendFastAck(clientId, ok, fastKnown, fast);
      } else {
        await watch.sendAck(clientId, ok);
      }
    };

    const replaySettledAck = async (
      clientId: string,
      settledOutcome: boolean,
      expectedOwnerId: string | undefined
    ) => {
      if (!settledOutcome || !watch.sendFastAck) {
        await sendAckWithFast(clientId, settledOutcome, false, null);
        return;
      }
      try {
        const serverConfig = await resolveWatchServerConfig(expectedOwnerId);
        if (!serverConfig) return;
        const latest = await fetchCurrentFast(serverConfig);
        if (!(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))) {
          return;
        }
        const parsedLatest = parseCurrentWatchFast(latest);
        if (!parsedLatest.known) {
          addLog(
            '[Watch] Settled fast ack refresh returned unreadable fast; deferring ack until retry',
            'WARNING'
          );
          return;
        }
        await sendAckWithFast(clientId, true, true, parsedLatest.fast);
      } catch (error) {
        addLog(
          `[Watch] Settled fast ack refresh failed; deferring ack until retry: ${String(error)}`,
          'WARNING'
        );
      }
    };

    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: fastingRootQueryKey });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
    };

    const markStartRetrying = (
      ownerKey: string,
      clientId: string,
      startedAt?: number
    ) => {
      if (!clientId) return;
      let map = retryingStartsByOwnerRef.current.get(ownerKey);
      if (!map) {
        map = new Map<string, RetryingStartEntry>();
        retryingStartsByOwnerRef.current.set(ownerKey, map);
      }
      const validStartedAt =
        startedAt != null && Number.isFinite(startedAt) && startedAt > 0
          ? startedAt
          : null;
      const existing = map.get(clientId);
      map.set(clientId, {
        clientId,
        startedAt: validStartedAt ?? existing?.startedAt ?? null,
        recordedAt: existing?.recordedAt ?? Date.now(),
      });
    };

    const clearRetryingStart = (ownerKey: string, clientId: string) => {
      const map = retryingStartsByOwnerRef.current.get(ownerKey);
      if (!map) return;
      map.delete(clientId);
      if (map.size === 0) {
        retryingStartsByOwnerRef.current.delete(ownerKey);
      }
    };

    const isStartlessEnd = (payload: WatchFastEndRequestPayload): boolean => {
      const requestedFastId = payload.fastId?.trim() ?? '';
      if (requestedFastId !== '') return false;
      const hasStartedAt =
        payload.startedAt != null &&
        Number.isFinite(payload.startedAt) &&
        payload.startedAt > 0;
      return !hasStartedAt;
    };

    const pruneOlderRetryingStarts = (
      ownerKey: string,
      expectedOwnerId: string | undefined,
      newerStartedAt: number,
      excludeClientIds?: string | readonly string[]
    ): boolean => {
      if (!Number.isFinite(newerStartedAt) || newerStartedAt <= 0) return false;
      const map = retryingStartsByOwnerRef.current.get(ownerKey);
      if (!map) return false;
      const excluded = new Set(
        excludeClientIds == null
          ? []
          : typeof excludeClientIds === 'string'
            ? excludeClientIds
              ? [excludeClientIds]
              : []
            : excludeClientIds.filter(Boolean)
      );
      const prunedStartIds: string[] = [];
      for (const [cid, entry] of map.entries()) {
        if (excluded.has(cid)) continue;
        const entryTime = entry.startedAt ?? entry.recordedAt;
        if (entryTime < newerStartedAt - 1_000) {
          map.delete(cid);
          if (cid) {
            recordSettled(`${expectedOwnerId ?? ''}:${cid}`, true);
            prunedStartIds.push(cid);
          }
        }
      }
      if (map.size === 0) {
        retryingStartsByOwnerRef.current.delete(ownerKey);
      }
      if (prunedStartIds.length > 0) {
        const deferredList = deferredEndsByOwnerRef.current.get(ownerKey);
        if (deferredList) {
          for (const deferred of deferredList) {
            const dependedOnPruned = prunedStartIds.some((id) =>
              deferred.blockedByStartIds.has(id)
            );
            const dependedOnSurvivor = [...excluded].some((id) =>
              deferred.blockedByStartIds.has(id)
            );
            let removedOriginal = false;
            for (const id of prunedStartIds) {
              deferred.blockedByStartIds.delete(id);
              if (deferred.remainingOriginalStartIds.delete(id)) {
                removedOriginal = true;
              }
            }
            const retiredLastOriginal =
              removedOriginal &&
              deferred.remainingOriginalStartIds.size === 0 &&
              !deferred.hasConfirmedOriginalStart;
            if (
              ((dependedOnPruned &&
                !dependedOnSurvivor &&
                deferred.blockedByStartIds.size === 0) ||
                retiredLastOriginal) &&
              isStartlessEnd(deferred.payload)
            ) {
              deferred.supersededByStartPrune = true;
            }
          }
        }
      }
      return prunedStartIds.length > 0;
    };

    const hasRetryingStart = (ownerKey: string) =>
      (retryingStartsByOwnerRef.current.get(ownerKey)?.size ?? 0) > 0;

    const getBlockingRetryingStartIds = (
      ownerKey: string,
      payload: WatchFastEndRequestPayload
    ): string[] => {
      if (!payload.ownerId?.trim()) return [];
      const retrying = retryingStartsByOwnerRef.current.get(ownerKey);
      if (!retrying || retrying.size === 0) return [];
      const requestedFastId = payload.fastId?.trim() ?? '';
      if (requestedFastId !== '') return [];
      const requestedStartedAt = payload.startedAt;
      const hasStartedAt =
        requestedStartedAt != null &&
        Number.isFinite(requestedStartedAt) &&
        requestedStartedAt > 0;
      const blocking: string[] = [];
      if (!hasStartedAt) {
        const requestedEndedAt = payload.endedAt;
        const hasEndedAt =
          requestedEndedAt != null &&
          Number.isFinite(requestedEndedAt) &&
          requestedEndedAt > 0;
        for (const [cid, entry] of retrying.entries()) {
          if (
            !hasEndedAt ||
            entry.startedAt == null ||
            entry.startedAt <= requestedEndedAt
          ) {
            blocking.push(cid);
          }
        }
        return blocking;
      }
      for (const [cid, entry] of retrying.entries()) {
        if (
          entry.startedAt != null &&
          Math.abs(entry.startedAt - requestedStartedAt) <= 1_000
        ) {
          blocking.push(cid);
        }
      }
      return blocking;
    };

    const deferEnd = (
      ownerKey: string,
      payload: WatchFastEndRequestPayload,
      blockingStartIds: readonly string[]
    ) => {
      const list = deferredEndsByOwnerRef.current.get(ownerKey) ?? [];
      if (payload.clientId) {
        const existing = list.find(
          (item) => item.payload.clientId === payload.clientId
        );
        if (existing) {
          for (const id of blockingStartIds) {
            existing.blockedByStartIds.add(id);
          }
          return;
        }
      }
      deferredEndsByOwnerRef.current.set(ownerKey, [
        ...list,
        {
          payload,
          blockedByStartIds: new Set(blockingStartIds),
          remainingOriginalStartIds: new Set(blockingStartIds),
          confirmedFastIds: new Set<string>(),
          hasConfirmedOriginalStart: false,
          supersededByStartPrune: false,
        },
      ]);
    };

    const enqueueForOwner = (ownerKey: string, task: () => Promise<void>) => {
      const prev = ownerQueueRef.current.get(ownerKey) ?? Promise.resolve();
      const next = prev.then(task, task);
      const tracked = next.catch(() => undefined);
      ownerQueueRef.current.set(ownerKey, tracked);
      void tracked.finally(() => {
        if (ownerQueueRef.current.get(ownerKey) === tracked) {
          ownerQueueRef.current.delete(ownerKey);
        }
      });
      return tracked;
    };

    const executeEnd = async (
      resolvedOwner: string,
      payload: WatchFastEndRequestPayload,
      allowedFastIds?: ReadonlySet<string>
    ) => {
      const expectedOwnerId = resolvedOwner || undefined;
      if (!(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))) {
        return;
      }
      const dedupeKey = `${resolvedOwner}:${payload.clientId}`;
      const settledOutcome = settledRef.current.get(dedupeKey);
      if (settledOutcome !== undefined) {
        await replaySettledAck(
          payload.clientId,
          settledOutcome,
          expectedOwnerId
        );
        return;
      }
      const blockingStartIds = getBlockingRetryingStartIds(
        resolvedOwner,
        payload
      );
      if (blockingStartIds.length > 0) {
        deferEnd(resolvedOwner, payload, blockingStartIds);
        return;
      }
      try {
        const readConfig = await resolveWatchServerConfig(expectedOwnerId);
        if (!readConfig) return;
        const current = await fetchCurrentFast(readConfig);
        if (!(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))) {
          return;
        }
        // A calculated fast has no row to end (the server cannot find its id), so
        // there is nothing to do; it ends by itself when the next meal is logged.
        let ackFast: WatchContextPayload['fast'] = null;
        if (current && !current.is_auto_calculated) {
          const serverStartedAt = new Date(current.start_time).getTime();
          const requestedFastId = payload.fastId?.trim() ?? '';
          const requestedStartedAt = payload.startedAt;
          const hasStartedAt =
            requestedStartedAt != null &&
            Number.isFinite(requestedStartedAt) &&
            requestedStartedAt > 0;
          const requestedEndedAt = payload.endedAt;
          const hasEndedAt =
            requestedEndedAt != null &&
            Number.isFinite(requestedEndedAt) &&
            requestedEndedAt > 0;
          const staleReplay =
            requestedFastId !== ''
              ? current.id !== requestedFastId
              : allowedFastIds && allowedFastIds.size > 0
                ? !allowedFastIds.has(current.id)
                : hasStartedAt
                  ? !Number.isFinite(serverStartedAt) ||
                    Math.abs(serverStartedAt - requestedStartedAt) > 1_000 ||
                    (hasEndedAt && serverStartedAt > requestedEndedAt)
                  : hasEndedAt &&
                    (!Number.isFinite(serverStartedAt) ||
                      serverStartedAt > requestedEndedAt);
          if (staleReplay) {
            ackFast = toWatchFast(current) ?? null;
          } else {
            const rawEndMs =
              payload.endedAt != null &&
              Number.isFinite(payload.endedAt) &&
              payload.endedAt > 0
                ? payload.endedAt
                : Date.now();
            const safeEndMs = Number.isFinite(serverStartedAt)
              ? Math.max(rawEndMs, serverStartedAt)
              : rawEndMs;
            const writeConfig = await resolveWatchServerConfig(expectedOwnerId);
            if (!writeConfig) return;
            await endFast({
              id: current.id,
              startTime: current.start_time,
              endTime: new Date(safeEndMs).toISOString(),
              serverConfig: writeConfig,
            });
            if (
              !(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))
            ) {
              return;
            }
            void cancelFastGoalNotification(current.id);
          }
        } else if (current?.is_auto_calculated) {
          ackFast = toWatchFast(current) ?? null;
        }
        refresh();
        if (payload.clientId) recordSettled(dedupeKey, true);
        try {
          await sendAckWithFast(payload.clientId, true, true, ackFast);
        } catch (ackError) {
          addLog(
            `[Watch] Fast end ack failed after commit; settled for replay: ${String(ackError)}`,
            'WARNING'
          );
        }
      } catch (error) {
        addLog(`[Watch] Fast end failed: ${String(error)}`, 'WARNING');
        const isPermanent = isPermanentWatchClientRejection(error);
        if (isPermanent || !payload.ownerId?.trim()) {
          if (isPermanent && payload.clientId) recordSettled(dedupeKey, false);
          if (await isPayloadForActiveServer({ ownerId: expectedOwnerId })) {
            try {
              await sendAckWithFast(payload.clientId, false, false, null);
            } catch (ackError) {
              addLog(
                `[Watch] Fast end rejection ack failed: ${String(ackError)}`,
                'WARNING'
              );
            }
          }
        }
      }
    };

    const isMatchingFastForStart = (
      fast: FastingLog,
      payload: WatchFastStartRequestPayload
    ): boolean => {
      const reqClientId = payload.clientId?.trim() ?? '';
      const hasServerClientIdField =
        Object.prototype.hasOwnProperty.call(fast, 'client_id') &&
        fast.client_id !== undefined;
      if (hasServerClientIdField) {
        const rowClientId =
          typeof fast.client_id === 'string' ? fast.client_id.trim() : '';
        if (
          reqClientId !== '' &&
          clientRequestIdSchema.safeParse(reqClientId).success
        ) {
          return (
            rowClientId !== '' &&
            rowClientId.toLowerCase() === reqClientId.toLowerCase()
          );
        }
        if (rowClientId !== '') {
          return (
            reqClientId !== '' &&
            rowClientId.toLowerCase() === reqClientId.toLowerCase()
          );
        }
      }
      const reqStartedAt = payload.startedAt;
      if (
        reqStartedAt == null ||
        !Number.isFinite(reqStartedAt) ||
        reqStartedAt <= 0
      ) {
        return false;
      }
      const serverStartedAt =
        typeof fast.start_time === 'string' && fast.start_time.trim() !== ''
          ? new Date(fast.start_time).getTime()
          : Number.NaN;
      return (
        Number.isFinite(serverStartedAt) &&
        Math.abs(serverStartedAt - reqStartedAt) <= 1_000
      );
    };

    const drainDeferredEnds = async (
      ownerKey: string,
      startOutcome:
        'confirmed' | 'rejected' | 'terminal' | 'superseded' = 'confirmed',
      settledStartClientIds?: string | readonly string[],
      confirmedFastId?: string
    ) => {
      const pending = deferredEndsByOwnerRef.current.get(ownerKey);
      if (!pending || pending.length === 0) return;
      const settledIds =
        settledStartClientIds == null
          ? []
          : typeof settledStartClientIds === 'string'
            ? settledStartClientIds
              ? [settledStartClientIds]
              : []
            : settledStartClientIds.filter(Boolean);
      const cleanConfirmedFastId = confirmedFastId?.trim() ?? '';
      const unblocked: DeferredEndEntry[] = [];
      const stillBlocked: DeferredEndEntry[] = [];
      for (const deferred of pending) {
        if (settledIds.length > 0) {
          let removedOriginal = false;
          for (const id of settledIds) {
            if (deferred.remainingOriginalStartIds.delete(id)) {
              removedOriginal = true;
            }
          }
          if (removedOriginal) {
            if (startOutcome === 'confirmed') {
              deferred.hasConfirmedOriginalStart = true;
              if (cleanConfirmedFastId !== '') {
                deferred.confirmedFastIds.add(cleanConfirmedFastId);
              }
            } else if (
              deferred.remainingOriginalStartIds.size === 0 &&
              !deferred.hasConfirmedOriginalStart &&
              isStartlessEnd(deferred.payload)
            ) {
              deferred.supersededByStartPrune = true;
            }
          }
        }
        if (deferred.supersededByStartPrune) {
          unblocked.push(deferred);
          continue;
        }
        const currentBlockers = getBlockingRetryingStartIds(
          ownerKey,
          deferred.payload
        );
        if (currentBlockers.length > 0) {
          deferred.blockedByStartIds = new Set(currentBlockers);
          stillBlocked.push(deferred);
        } else {
          const retiredByNonActiveStart =
            (startOutcome === 'terminal' || startOutcome === 'superseded') &&
            (settledIds.length === 0 ||
              settledIds.some((id) => deferred.blockedByStartIds.has(id)));
          if (
            (startOutcome === 'rejected' || retiredByNonActiveStart) &&
            !deferred.hasConfirmedOriginalStart &&
            !deferred.supersededByStartPrune &&
            isStartlessEnd(deferred.payload)
          ) {
            deferred.supersededByStartPrune = true;
          }
          unblocked.push(deferred);
        }
      }
      if (stillBlocked.length > 0) {
        deferredEndsByOwnerRef.current.set(ownerKey, stillBlocked);
      } else {
        deferredEndsByOwnerRef.current.delete(ownerKey);
      }
      const expectedOwnerId = ownerKey || undefined;
      for (const deferred of unblocked) {
        if (deferred.supersededByStartPrune) {
          if (!(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))) {
            continue;
          }
          if (deferred.payload.clientId) {
            recordSettled(`${ownerKey}:${deferred.payload.clientId}`, true);
          }
          try {
            await replaySettledAck(
              deferred.payload.clientId,
              true,
              expectedOwnerId
            );
          } catch (ackError) {
            addLog(
              `[Watch] Superseded fast end ack failed: ${String(ackError)}`,
              'WARNING'
            );
          }
        } else {
          await executeEnd(
            ownerKey,
            deferred.payload,
            deferred.confirmedFastIds.size > 0
              ? deferred.confirmedFastIds
              : undefined
          );
        }
      }
    };

    const executeStart = async (
      resolvedOwner: string,
      payload: WatchFastStartRequestPayload
    ) => {
      const expectedOwnerId = resolvedOwner || undefined;
      if (!(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))) {
        return;
      }
      const dedupeKey = `${resolvedOwner}:${payload.clientId}`;
      const settledOutcome = settledRef.current.get(dedupeKey);
      if (settledOutcome !== undefined) {
        await replaySettledAck(
          payload.clientId,
          settledOutcome,
          expectedOwnerId
        );
        return;
      }
      try {
        const preset = FASTING_PRESETS.find((p) => p.id === payload.presetId);
        if (!preset)
          throw new ApiError(`Unknown preset ${payload.presetId}`, 400);
        const readConfig = await resolveWatchServerConfig(expectedOwnerId);
        if (!readConfig) {
          clearRetryingStart(resolvedOwner, payload.clientId);
          deferredEndsByOwnerRef.current.delete(resolvedOwner);
          return;
        }
        const current = await fetchCurrentFast(readConfig);
        if (!(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))) {
          clearRetryingStart(resolvedOwner, payload.clientId);
          deferredEndsByOwnerRef.current.delete(resolvedOwner);
          return;
        }
        // A fast the server worked out from the user's meals is not a manual
        // one: it is always "current" while auto-calculation is on, so it must
        // not stop the wrist from starting a real fast.
        let ackWatchFast: WatchContextPayload['fast'] = null;
        let deferAckUntilRefresh = false;
        let startOutcome: 'confirmed' | 'terminal' | 'superseded' = 'confirmed';
        if (!current || current.is_auto_calculated) {
          const startMs =
            payload.startedAt != null &&
            Number.isFinite(payload.startedAt) &&
            payload.startedAt > 0
              ? payload.startedAt
              : Date.now();
          const targetMs = startMs + preset.fastingHours * 3_600_000;
          const writeConfig = await resolveWatchServerConfig(expectedOwnerId);
          if (!writeConfig) {
            clearRetryingStart(resolvedOwner, payload.clientId);
            deferredEndsByOwnerRef.current.delete(resolvedOwner);
            return;
          }
          const created = await startFast({
            startTime: new Date(startMs).toISOString(),
            targetEndTime: new Date(targetMs).toISOString(),
            fastingType: preset.name,
            clientId: payload.clientId,
            serverConfig: writeConfig,
          });
          if (!(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))) {
            clearRetryingStart(resolvedOwner, payload.clientId);
            deferredEndsByOwnerRef.current.delete(resolvedOwner);
            return;
          }
          if (isTerminalFast(created)) {
            startOutcome = 'terminal';
            // A replayed start can return an already-ended or cancelled fast;
            // re-fetch /current so the watch gets true server state instead of
            // reviving the terminal fast with an optimistic payload.
            try {
              const latest = await fetchCurrentFast(writeConfig);
              if (
                !(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))
              ) {
                clearRetryingStart(resolvedOwner, payload.clientId);
                deferredEndsByOwnerRef.current.delete(resolvedOwner);
                return;
              }
              const parsedLatest = parseCurrentWatchFast(latest);
              if (!parsedLatest.known) {
                addLog(
                  '[Watch] Replayed fast start refresh returned unreadable fast; deferring ack until retry',
                  'WARNING'
                );
                deferAckUntilRefresh = true;
                ackWatchFast = null;
              } else {
                ackWatchFast = parsedLatest.fast;
              }
            } catch (refreshError) {
              if (
                !(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))
              ) {
                clearRetryingStart(resolvedOwner, payload.clientId);
                deferredEndsByOwnerRef.current.delete(resolvedOwner);
                return;
              }
              addLog(
                `[Watch] Replayed fast start refresh failed; deferring ack until retry: ${String(refreshError)}`,
                'WARNING'
              );
              deferAckUntilRefresh = true;
              ackWatchFast = null;
            }
          } else {
            ackWatchFast = toWatchFast(created) ?? {
              startedAt: startMs,
              targetEndAt: targetMs,
              label: preset.name,
            };
          }
        } else {
          const parsedCurrent = parseCurrentWatchFast(current);
          if (parsedCurrent.known) {
            ackWatchFast = parsedCurrent.fast;
            if (!isMatchingFastForStart(current, payload)) {
              startOutcome = 'superseded';
            }
          } else if (watch.sendFastAck) {
            throw new Error(
              'Unreadable current fast response before fast start'
            );
          } else {
            ackWatchFast = null;
            startOutcome = 'superseded';
          }
        }
        clearRetryingStart(resolvedOwner, payload.clientId);
        if (ackWatchFast?.startedAt != null) {
          pruneOlderRetryingStarts(
            resolvedOwner,
            expectedOwnerId,
            ackWatchFast.startedAt,
            startOutcome === 'confirmed' ? payload.clientId : undefined
          );
        }
        refresh();
        if (payload.clientId) recordSettled(dedupeKey, true);
        if (!deferAckUntilRefresh || !watch.sendFastAck) {
          try {
            await sendAckWithFast(
              payload.clientId,
              true,
              !deferAckUntilRefresh,
              ackWatchFast
            );
          } catch (ackError) {
            addLog(
              `[Watch] Fast start ack failed after commit; settled for replay: ${String(ackError)}`,
              'WARNING'
            );
          }
        }
        await drainDeferredEnds(
          resolvedOwner,
          startOutcome,
          payload.clientId,
          startOutcome === 'confirmed'
            ? (ackWatchFast?.id ?? undefined)
            : undefined
        );
      } catch (error) {
        addLog(`[Watch] Fast start failed: ${String(error)}`, 'WARNING');
        if (isPermanentWatchClientRejection(error)) {
          clearRetryingStart(resolvedOwner, payload.clientId);
          if (payload.clientId) recordSettled(dedupeKey, false);
          if (await isPayloadForActiveServer({ ownerId: expectedOwnerId })) {
            try {
              await sendAckWithFast(payload.clientId, false, false, null);
            } catch (ackError) {
              addLog(
                `[Watch] Fast start rejection ack failed: ${String(ackError)}`,
                'WARNING'
              );
            }
            await drainDeferredEnds(
              resolvedOwner,
              'rejected',
              payload.clientId
            );
          } else {
            deferredEndsByOwnerRef.current.delete(resolvedOwner);
          }
        } else if (!payload.ownerId?.trim()) {
          if (await isPayloadForActiveServer({ ownerId: expectedOwnerId })) {
            try {
              await sendAckWithFast(payload.clientId, false, false, null);
            } catch (ackError) {
              addLog(
                `[Watch] Fast start transient ack failed: ${String(ackError)}`,
                'WARNING'
              );
            }
          }
        } else {
          markStartRetrying(resolvedOwner, payload.clientId, payload.startedAt);
        }
      }
    };

    const onStart = (payload: WatchFastStartRequestPayload) =>
      scheduleWithResolvedOwner(payload.ownerId, (resolvedOwner) => {
        const flightKey = `${resolvedOwner}:${payload.clientId}`;
        if (payload.clientId && inFlightRef.current.has(flightKey)) return;
        if (payload.clientId) inFlightRef.current.add(flightKey);
        void enqueueForOwner(resolvedOwner, async () => {
          try {
            await executeStart(resolvedOwner, payload);
          } finally {
            if (payload.clientId) inFlightRef.current.delete(flightKey);
          }
        });
      });

    const onEnd = (payload: WatchFastEndRequestPayload) =>
      scheduleWithResolvedOwner(payload.ownerId, (resolvedOwner) => {
        const flightKey = `${resolvedOwner}:${payload.clientId}`;
        if (payload.clientId && inFlightRef.current.has(flightKey)) return;
        if (payload.clientId) inFlightRef.current.add(flightKey);
        void enqueueForOwner(resolvedOwner, async () => {
          try {
            await executeEnd(resolvedOwner, payload);
          } finally {
            if (payload.clientId) inFlightRef.current.delete(flightKey);
          }
        });
      });

    const onServerSynced = (payload: WatchServerSyncedPayload) => {
      if (payload.domain !== 'fasting') return;
      return scheduleWithResolvedOwner(payload.ownerId, (resolvedOwner) => {
        void enqueueForOwner(resolvedOwner, async () => {
          const expectedOwnerId = resolvedOwner || undefined;
          if (!(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))) {
            return;
          }
          const syncedClientId = payload.clientId?.trim() ?? '';
          if (syncedClientId !== '') {
            const matchingRetrying = retryingStartsByOwnerRef.current
              .get(resolvedOwner)
              ?.get(syncedClientId);
            if (!matchingRetrying) {
              recordSettled(`${resolvedOwner}:${syncedClientId}`, true);
            } else {
              const explicitOutcome = payload.fastStartOutcome;
              let resolvedOutcome: 'confirmed' | 'terminal' | 'superseded' =
                explicitOutcome ?? 'confirmed';
              let verifiedFastId: string | undefined;
              if (explicitOutcome === undefined) {
                const pendingEnds =
                  deferredEndsByOwnerRef.current.get(resolvedOwner) ?? [];
                const hasGuardedStartlessEnd = pendingEnds.some(
                  (deferred) =>
                    isStartlessEnd(deferred.payload) &&
                    (deferred.blockedByStartIds.has(syncedClientId) ||
                      deferred.remainingOriginalStartIds.has(syncedClientId))
                );
                if (hasGuardedStartlessEnd) {
                  try {
                    const readConfig =
                      await resolveWatchServerConfig(expectedOwnerId);
                    if (!readConfig) return;
                    const current = await fetchCurrentFast(readConfig);
                    if (
                      !(await isPayloadForActiveServer({
                        ownerId: expectedOwnerId,
                      }))
                    ) {
                      return;
                    }
                    const isMatchingCurrent =
                      current != null &&
                      !current.is_auto_calculated &&
                      !current.is_eating_window &&
                      !isTerminalFast(current) &&
                      isMatchingFastForStart(current, {
                        clientId: syncedClientId,
                        presetId: '',
                        startedAt: matchingRetrying.startedAt ?? undefined,
                      });
                    resolvedOutcome = isMatchingCurrent
                      ? 'confirmed'
                      : 'superseded';
                    if (isMatchingCurrent && current.id) {
                      verifiedFastId = current.id;
                    }
                  } catch {
                    // Leave the retrying start unsettled and deferred startless
                    // end intact until server state can be confirmed.
                    return;
                  }
                }
              }
              recordSettled(`${resolvedOwner}:${syncedClientId}`, true);
              clearRetryingStart(resolvedOwner, syncedClientId);
              if (
                resolvedOutcome === 'confirmed' &&
                matchingRetrying.startedAt != null
              ) {
                pruneOlderRetryingStarts(
                  resolvedOwner,
                  expectedOwnerId,
                  matchingRetrying.startedAt,
                  syncedClientId
                );
              }
              await drainDeferredEnds(
                resolvedOwner,
                resolvedOutcome,
                syncedClientId,
                verifiedFastId
              );
              return;
            }
          }
          if (!hasRetryingStart(resolvedOwner)) return;
          try {
            const readConfig = await resolveWatchServerConfig(expectedOwnerId);
            if (!readConfig) return;
            const current = await fetchCurrentFast(readConfig);
            if (
              !(await isPayloadForActiveServer({ ownerId: expectedOwnerId }))
            ) {
              return;
            }
            if (
              current &&
              !current.is_auto_calculated &&
              !current.is_eating_window &&
              !isTerminalFast(current)
            ) {
              const serverStartedAt = new Date(current.start_time).getTime();
              const retryingMap =
                retryingStartsByOwnerRef.current.get(resolvedOwner);
              if (Number.isFinite(serverStartedAt) && retryingMap) {
                const matchedClientIds: string[] = [];
                if (syncedClientId === '') {
                  for (const [cid, entry] of retryingMap.entries()) {
                    if (
                      isMatchingFastForStart(current, {
                        clientId: cid,
                        presetId: '',
                        startedAt: entry.startedAt ?? undefined,
                      })
                    ) {
                      matchedClientIds.push(cid);
                    }
                  }
                }
                const matchedFastId = current.id?.trim() ?? '';
                if (matchedClientIds.length > 0) {
                  for (const cid of matchedClientIds) {
                    recordSettled(`${resolvedOwner}:${cid}`, true);
                    clearRetryingStart(resolvedOwner, cid);
                  }
                  const deferredList =
                    deferredEndsByOwnerRef.current.get(resolvedOwner);
                  if (deferredList) {
                    for (const deferred of deferredList) {
                      for (const cid of matchedClientIds) {
                        if (deferred.remainingOriginalStartIds.delete(cid)) {
                          deferred.hasConfirmedOriginalStart = true;
                          if (matchedFastId !== '') {
                            deferred.confirmedFastIds.add(matchedFastId);
                          }
                        }
                      }
                    }
                  }
                }
                const prunedOlder = pruneOlderRetryingStarts(
                  resolvedOwner,
                  expectedOwnerId,
                  serverStartedAt,
                  matchedClientIds
                );
                if (matchedClientIds.length > 0 || prunedOlder) {
                  await drainDeferredEnds(
                    resolvedOwner,
                    'confirmed',
                    matchedClientIds,
                    matchedFastId || undefined
                  );
                }
              }
            }
          } catch {
            // Leave retrying starts and deferred ends intact until server state is confirmed.
          }
        });
      });
    };

    const startSub = watch.addListener(
      'onFastStartRequested',
      (p) => void onStart(p)
    );
    const endSub = watch.addListener(
      'onFastEndRequested',
      (p) => void onEnd(p)
    );
    const syncedSub = watch.addListener(
      'onWatchServerSynced',
      (p) => void onServerSynced(p)
    );
    return () => {
      startSub.remove();
      endSub.remove();
      syncedSub.remove();
    };
  }, [enabled]);
}
