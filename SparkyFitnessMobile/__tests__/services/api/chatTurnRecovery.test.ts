import {
  pendingHistoryTurn,
  recoverChatTurn,
} from '../../../src/services/api/chatTurnRecovery';

const id = 'c37bc122-75db-4e57-aac0-e58bfff12131';
const user = { role: 'user', metadata: { turnId: id } };
const assistant = { role: 'assistant', metadata: { turnId: id } };
const signal = new AbortController().signal;

it('resumes only a marked trailing user prompt after a cold launch', () => {
  expect(pendingHistoryTurn([user])).toBe(id);
  expect(pendingHistoryTurn([user, assistant])).toBeUndefined();
  expect(
    pendingHistoryTurn([{ ...user, metadata: { turnId: '../bad' } }])
  ).toBeUndefined();
});

it('recovers a finished turn from authenticated history without attaching', async () => {
  const attach = jest.fn();
  const history = [user, assistant];
  await expect(
    recoverChatTurn(id, signal, async () => history, attach)
  ).resolves.toBe(history);
  expect(attach).not.toHaveBeenCalled();
});

it('attaches once and returns the saved answer without running replayed tools', async () => {
  const read = jest
    .fn()
    .mockResolvedValueOnce([user])
    .mockResolvedValueOnce([user, assistant]);
  const attach = jest.fn().mockResolvedValue('closed');
  await expect(recoverChatTurn(id, signal, read, attach)).resolves.toEqual([
    user,
    assistant,
  ]);
  expect(attach).toHaveBeenCalledTimes(1);
});

it('preserves an explicit provider failure without treating the prompt as an answer', async () => {
  await expect(
    recoverChatTurn(
      id,
      signal,
      async () => [user],
      async () => {
        throw new Error('provider failed');
      }
    )
  ).rejects.toThrow('provider failed');
});

it('never attaches a turn absent from this account history', async () => {
  const attach = jest.fn();
  await expect(
    recoverChatTurn(id, signal, async () => [], attach)
  ).resolves.toBeUndefined();
  expect(attach).not.toHaveBeenCalled();
});

it('checks durable history after the server evicted a replay', async () => {
  const read = jest
    .fn()
    .mockResolvedValueOnce([user])
    .mockResolvedValueOnce([user, assistant]);
  await expect(
    recoverChatTurn(id, signal, read, async () => 'expired')
  ).resolves.toEqual([user, assistant]);
});

it('cancels without publishing a late history response', async () => {
  const controller = new AbortController();
  const attach = jest.fn();
  await expect(
    recoverChatTurn(
      id,
      controller.signal,
      async () => {
        controller.abort();
        return [user, assistant];
      },
      attach
    )
  ).resolves.toBeUndefined();
  expect(attach).not.toHaveBeenCalled();
});

it('follows a pending approval continuation on its saved assistant row', async () => {
  const continuation = 'e21bc122-75db-4e57-aac0-e58bfff12132';
  const pending = {
    ...assistant,
    metadata: { turnId: id, pendingTurnId: continuation },
  };
  const done = { ...assistant, metadata: { turnId: continuation } };
  expect(pendingHistoryTurn([user, pending])).toBe(continuation);
  expect(pendingHistoryTurn([user, done])).toBeUndefined();
  const attach = jest.fn().mockResolvedValue('closed');
  const read = jest
    .fn()
    .mockResolvedValueOnce([user, pending])
    .mockResolvedValueOnce([user, done]);
  await expect(
    recoverChatTurn(continuation, signal, read, attach)
  ).resolves.toEqual([user, done]);
  expect(attach).toHaveBeenCalledTimes(1);
});

it('does not resume a cancelled prompt on reopening chat', () => {
  expect(
    pendingHistoryTurn([
      { ...user, metadata: { turnId: id, turnState: 'cancelled' } },
    ])
  ).toBeUndefined();
});
