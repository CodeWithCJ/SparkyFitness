import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkIn,
  getSharedSettings,
  joinMembers,
  withdrawMember,
} from '../models/sharedSettingsRepository.js';
import { log } from '../config/logging.js';
import { getAgreedIdentitySettings } from '../utils/agreedSharedSettings.js';
import {
  HEARTBEAT_MS,
  startSharedSettings,
  stopSharedSettings,
  type AgreementResult,
} from '../services/sharedSettingsService.js';

vi.mock('../models/sharedSettingsRepository.js', () => ({
  checkIn: vi.fn(),
  getSharedSettings: vi.fn(),
  joinMembers: vi.fn(),
  withdrawMember: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/versionService.js', () => ({
  getAppVersion: () => '1.7.2',
}));

const identity = { enable_email_password_login: null, is_oidc_active: true };
const saved: AgreementResult = {
  membership: { expectedCount: 1, pendingCount: null, pendingSince: null },
  groups: [{ group: 'identity', status: 'save', payload: identity }],
};

describe('shared settings membership loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('SPARKY_FITNESS_OIDC_AUTH_ENABLED', 'true');
    vi.stubEnv('SPARKY_FITNESS_FORCE_EMAIL_LOGIN', '');
    vi.stubEnv('SPARKY_FITNESS_DISABLE_EMAIL_LOGIN', '');
    vi.mocked(joinMembers).mockResolvedValue('member-1');
    vi.mocked(checkIn).mockResolvedValue(saved);
    vi.mocked(getSharedSettings).mockResolvedValue({
      identity: { payload: identity, releaseVersion: '1.7.2' },
    });
  });

  afterEach(async () => {
    await stopSharedSettings();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('joins and checks in with the environment settings before serving', async () => {
    await startSharedSettings();

    expect(joinMembers).toHaveBeenCalledWith('1.7.2', { identity }, 30_000);
    expect(checkIn).toHaveBeenCalledWith(
      'member-1',
      { identity },
      '1.7.2',
      30_000,
      expect.any(Function)
    );
  });

  it('serves without waiting when a group has no saved settings yet', async () => {
    vi.mocked(getSharedSettings).mockResolvedValue({});

    await startSharedSettings();

    expect(checkIn).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('No agreed settings yet for identity')
    );
  });

  it('serves the agreed settings instead of its own environment', async () => {
    vi.stubEnv('SPARKY_FITNESS_OIDC_AUTH_ENABLED', '');
    vi.mocked(getSharedSettings).mockResolvedValue({
      identity: {
        payload: { enable_email_password_login: false, is_oidc_active: true },
        releaseVersion: '1.7.2',
      },
    });

    await startSharedSettings();

    expect(getAgreedIdentitySettings()).toEqual({
      enable_email_password_login: false,
      is_oidc_active: true,
    });
  });

  it('warns once about a field this release does not support', async () => {
    vi.mocked(getSharedSettings).mockResolvedValue({
      identity: {
        payload: { ...identity, disable_passkey_login: true },
        releaseVersion: '1.9.0',
      },
    });

    await startSharedSettings();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);

    const warnings = vi
      .mocked(log)
      .mock.calls.filter(([, message]) =>
        String(message).includes('disable_passkey_login')
      );
    expect(warnings).toHaveLength(1);
    expect(getAgreedIdentitySettings()).toEqual(identity);
  });

  it('holds startup until a damaged record is repaired', async () => {
    vi.mocked(getSharedSettings)
      .mockResolvedValueOnce({
        identity: { payload: {}, releaseVersion: '1.7.2' },
      })
      .mockResolvedValue({
        identity: { payload: identity, releaseVersion: '1.7.2' },
      });
    let started = false;
    const pending = startSharedSettings().then(() => {
      started = true;
    });

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS - 1);
    expect(started).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(getAgreedIdentitySettings()).toEqual(identity);
  });

  it('keeps the last good settings when a record is damaged later', async () => {
    await startSharedSettings();
    vi.stubEnv('SPARKY_FITNESS_OIDC_AUTH_ENABLED', '');
    vi.mocked(getSharedSettings).mockResolvedValue({
      identity: { payload: {}, releaseVersion: '1.7.2' },
    });

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);

    expect(getAgreedIdentitySettings()).toEqual(identity);
    const errors = vi
      .mocked(log)
      .mock.calls.filter(([level]) => level === 'error');
    expect(errors).toHaveLength(1);
  });

  it('renews membership on every heartbeat', async () => {
    await startSharedSettings();

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);

    expect(checkIn).toHaveBeenCalledTimes(3);
  });

  it('rejoins under a new ID when its membership expired', async () => {
    await startSharedSettings();
    vi.mocked(checkIn).mockResolvedValueOnce(null);
    vi.mocked(joinMembers).mockResolvedValueOnce('member-2');

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);

    expect(joinMembers).toHaveBeenCalledTimes(2);
    expect(vi.mocked(checkIn).mock.calls.at(-1)?.[0]).toBe('member-2');
  });

  it('keeps the heartbeat running after a failed check-in', async () => {
    await startSharedSettings();
    vi.mocked(checkIn).mockRejectedValueOnce(new Error('database away'));

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);

    expect(log).toHaveBeenCalledWith(
      'error',
      '[SHARED SETTINGS] Check-in failed:',
      expect.any(Error)
    );
    expect(checkIn).toHaveBeenCalledTimes(3);
  });

  it('does not start a check-in while the previous one is still running', async () => {
    await startSharedSettings();
    let finish: (result: AgreementResult) => void = () => {};
    vi.mocked(checkIn).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(checkIn).toHaveBeenCalledTimes(2);

    finish(saved);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(checkIn).toHaveBeenCalledTimes(3);
  });

  it('withdraws the rejoined ID when shutdown lands mid-rejoin', async () => {
    await startSharedSettings();
    let finishJoin: (id: string) => void = () => {};
    vi.mocked(checkIn).mockResolvedValueOnce(null);
    vi.mocked(joinMembers).mockReturnValueOnce(
      new Promise((resolve) => {
        finishJoin = resolve;
      })
    );
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);

    const stopping = stopSharedSettings();
    finishJoin('member-2');
    await stopping;

    expect(withdrawMember).toHaveBeenCalledWith('member-2');
    expect(withdrawMember).toHaveBeenCalledTimes(1);
  });

  it('withdraws and stops the heartbeat on shutdown', async () => {
    await startSharedSettings();

    await stopSharedSettings();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);

    expect(withdrawMember).toHaveBeenCalledWith('member-1');
    expect(checkIn).toHaveBeenCalledTimes(1);
  });
});
