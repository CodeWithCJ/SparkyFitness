import { Alert, Keyboard, type AlertButton } from 'react-native';
import Toast from 'react-native-toast-message';
import { renderHook } from '@testing-library/react-native';

import {
  startGuidedCheckIn,
  useGuidedCheckIn,
  type GuidedCheckIn,
} from '../../src/hooks/useGuidedCheckIn';
import { useGuidedCheckInStore } from '../../src/stores/guidedCheckInStore';
import { initializeI18n } from '../../src/localization/i18n';
import { offerCheckinRemindersAfterLeaving } from '../../src/services/offerCheckinReminders';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));
jest.mock('../../src/services/offerCheckinReminders', () => ({
  offerCheckinRemindersAfterLeaving: jest.fn(),
}));

type HookArgs = Parameters<typeof useGuidedCheckIn>[0];
type Navigation = HookArgs['navigation'];
type Step = HookArgs['step'];

const DATE = '2026-10-26';

const toastShow = jest.mocked(Toast.show);
const offerReminders = jest.mocked(offerCheckinRemindersAfterLeaving);

let alertSpy: jest.SpiedFunction<typeof Alert.alert>;
let dismissSpy: jest.SpiedFunction<typeof Keyboard.dismiss>;

function setup(overrides: Partial<Omit<HookArgs, 'navigation'>> = {}) {
  const replace = jest.fn();
  const goBack = jest.fn();
  const isFocused = jest.fn(() => true);
  const navigation: Navigation = { replace, goBack, isFocused };
  const initialProps: HookArgs = {
    navigation,
    step: 'MoodLog',
    date: DATE,
    params: {},
    ...overrides,
  };
  const hook = renderHook((props: HookArgs) => useGuidedCheckIn(props), {
    initialProps,
  });
  const checkIn = (): GuidedCheckIn => {
    const current = hook.result.current;
    if (!current) throw new Error('Expected a guided check-in');
    return current;
  };
  return { ...hook, initialProps, checkIn, replace, goBack, isFocused };
}

/** Presses a button of the most recent Alert.alert by its style. */
function pressAlertButton(style: AlertButton['style']) {
  const calls = alertSpy.mock.calls;
  const buttons = calls[calls.length - 1]?.[2] ?? [];
  const button = buttons.find((b) => b.style === style);
  if (!button?.onPress) throw new Error(`No ${style} button on the alert`);
  button.onPress();
}

describe('useGuidedCheckIn', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    useGuidedCheckInStore.setState({ progress: null });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    dismissSpy.mockRestore();
  });

  it('returns null when the screen was opened outside the check-in', () => {
    const { result } = setup({ params: undefined });

    expect(result.current).toBeNull();
  });

  it('returns null without a date', () => {
    const { result } = setup({ date: undefined });

    expect(result.current).toBeNull();
  });

  it.each<[Step, number]>([
    ['MoodLog', 1],
    ['MeasurementsAdd', 2],
    ['ProgressPhotos', 3],
  ])('numbers the %s step %i of 3', (step, number) => {
    const { checkIn } = setup({ step });

    expect(checkIn().step).toBe(number);
    expect(checkIn().total).toBe(3);
  });

  describe('advance', () => {
    it.each<
      [string, HookArgs['params'], Parameters<GuidedCheckIn['advance']>[0]]
    >([
      ['from the result', {}, { saved: true, offerReminders: true }],
      ['from the params', { saved: true, offerReminders: true }, undefined],
      ['from both', { offerReminders: true }, { saved: true }],
    ])(
      'replaces MoodLog with MeasurementsAdd, merging the flags %s',
      (_label, params, stepResult) => {
        const { checkIn, replace, goBack } = setup({ step: 'MoodLog', params });

        checkIn().advance(stepResult);

        expect(replace).toHaveBeenCalledTimes(1);
        expect(replace).toHaveBeenCalledWith('MeasurementsAdd', {
          date: DATE,
          guidedCheckIn: { offerReminders: true, saved: true },
        });
        expect(goBack).not.toHaveBeenCalled();
      }
    );

    it('hands over with both flags false when nothing was saved', () => {
      const { checkIn, replace } = setup({ step: 'MoodLog' });

      checkIn().advance();

      expect(replace).toHaveBeenCalledWith('MeasurementsAdd', {
        date: DATE,
        guidedCheckIn: { offerReminders: false, saved: false },
      });
    });

    it('replaces MeasurementsAdd with ProgressPhotos and never clears an earlier flag', () => {
      const { checkIn, replace } = setup({
        step: 'MeasurementsAdd',
        params: { offerReminders: true, saved: true },
      });

      checkIn().advance({ saved: false, offerReminders: false });

      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('ProgressPhotos', {
        date: DATE,
        guidedCheckIn: { offerReminders: true, saved: true },
      });
    });

    it('does nothing while the step is not focused, and works once it is', () => {
      const { checkIn, replace, isFocused } = setup({ step: 'MoodLog' });
      isFocused.mockReturnValue(false);

      checkIn().advance({ saved: true });

      expect(replace).not.toHaveBeenCalled();
      expect(dismissSpy).not.toHaveBeenCalled();
      expect(checkIn().hasLeft()).toBe(false);

      isFocused.mockReturnValue(true);
      checkIn().advance({ saved: true });

      expect(replace).toHaveBeenCalledTimes(1);
      expect(checkIn().hasLeft()).toBe(true);
    });

    it('ignores every later advance, skip and finish once the step has left', () => {
      const { checkIn, replace, goBack, rerender, initialProps } = setup({
        step: 'MoodLog',
      });
      expect(checkIn().hasLeft()).toBe(false);

      checkIn().advance({ saved: true });
      expect(checkIn().hasLeft()).toBe(true);

      checkIn().advance({ saved: true });
      checkIn().skip(false);
      checkIn().skip(true);
      checkIn().finish({ saved: true, offerReminders: true });
      // A new params object (a re-render) keeps the latch.
      rerender({ ...initialProps, params: { saved: true } });
      checkIn().advance();

      expect(replace).toHaveBeenCalledTimes(1);
      expect(goBack).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      expect(toastShow).not.toHaveBeenCalled();
      expect(offerReminders).not.toHaveBeenCalled();
      expect(dismissSpy).toHaveBeenCalledTimes(1);
      expect(checkIn().hasLeft()).toBe(true);
    });

    it('finishes from the last step instead of replacing it', () => {
      const { checkIn, replace, goBack } = setup({ step: 'ProgressPhotos' });

      checkIn().advance({ saved: true });

      expect(replace).not.toHaveBeenCalled();
      expect(goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledWith({
        type: 'success',
        text1: 'Check-in complete',
      });
      expect(checkIn().hasLeft()).toBe(true);
    });

    it('dismisses the keyboard before handing over', () => {
      const { checkIn, replace } = setup({ step: 'MeasurementsAdd' });

      checkIn().advance();

      expect(dismissSpy).toHaveBeenCalledTimes(1);
      expect(dismissSpy.mock.invocationCallOrder[0]).toBeLessThan(
        replace.mock.invocationCallOrder[0]
      );
    });
  });

  describe('skip', () => {
    it('moves on at once when the step has no unsaved edits', () => {
      const { checkIn, replace } = setup({
        step: 'MoodLog',
        params: { saved: false },
      });

      checkIn().skip(false);

      expect(alertSpy).not.toHaveBeenCalled();
      expect(replace).toHaveBeenCalledWith('MeasurementsAdd', {
        date: DATE,
        guidedCheckIn: { offerReminders: false, saved: false },
      });
    });

    it('asks first when the step has unsaved edits, and stays on Cancel', () => {
      const { checkIn, replace } = setup({ step: 'MeasurementsAdd' });

      checkIn().skip(true);

      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, message, buttons, options] = alertSpy.mock.calls[0];
      expect(title).toBe('Skip this step?');
      expect(message).toBe("Your changes on this step won't be saved.");
      expect(buttons).toEqual([
        expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
        expect.objectContaining({ text: 'Skip', style: 'destructive' }),
      ]);
      expect(options).toEqual(expect.objectContaining({ cancelable: true }));
      expect(replace).not.toHaveBeenCalled();

      pressAlertButton('cancel');

      expect(replace).not.toHaveBeenCalled();
      expect(checkIn().hasLeft()).toBe(false);

      checkIn().skip(true);

      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(replace).not.toHaveBeenCalled();
    });

    it('does not ask twice while the question is open', () => {
      const { checkIn } = setup({ step: 'MoodLog' });

      checkIn().skip(true);
      checkIn().skip(true);
      checkIn().skip(false);

      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('asks again after the question is dismissed', () => {
      const { checkIn, replace } = setup({ step: 'MoodLog' });

      checkIn().skip(true);
      alertSpy.mock.calls[0][3]?.onDismiss?.();
      checkIn().skip(true);

      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(replace).not.toHaveBeenCalled();
    });

    it('moves on without saving when Skip is confirmed', () => {
      const { checkIn, replace } = setup({
        step: 'MeasurementsAdd',
        params: { offerReminders: true, saved: true },
      });

      checkIn().skip(true);
      pressAlertButton('destructive');

      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('ProgressPhotos', {
        date: DATE,
        guidedCheckIn: { offerReminders: true, saved: true },
      });
      expect(checkIn().hasLeft()).toBe(true);
      expect(dismissSpy).toHaveBeenCalledTimes(1);
    });

    it('finishes from the last step with what earlier steps saved', () => {
      const { checkIn, replace, goBack } = setup({
        step: 'ProgressPhotos',
        params: { offerReminders: true, saved: true },
      });

      checkIn().skip(false);

      expect(replace).not.toHaveBeenCalled();
      expect(goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledTimes(1);
      expect(offerReminders).toHaveBeenCalledTimes(1);
    });
  });

  describe('finish', () => {
    it('goes back, then confirms, then offers reminders, in that order', () => {
      const { checkIn, goBack } = setup({
        step: 'ProgressPhotos',
        params: { offerReminders: true },
      });

      checkIn().finish({ saved: true });

      expect(goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledWith({
        type: 'success',
        text1: 'Check-in complete',
      });
      expect(offerReminders).toHaveBeenCalledTimes(1);
      expect(offerReminders).toHaveBeenCalledWith(expect.any(Function));

      const [dismissed] = dismissSpy.mock.invocationCallOrder;
      const [wentBack] = goBack.mock.invocationCallOrder;
      const [toasted] = toastShow.mock.invocationCallOrder;
      const [offered] = offerReminders.mock.invocationCallOrder;
      expect(dismissed).toBeLessThan(wentBack);
      expect(wentBack).toBeLessThan(toasted);
      expect(toasted).toBeLessThan(offered);
    });

    it('confirms when an earlier step saved, without offering reminders', () => {
      const { checkIn, goBack } = setup({
        step: 'ProgressPhotos',
        params: { saved: true, offerReminders: false },
      });

      checkIn().finish();

      expect(goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledTimes(1);
      expect(offerReminders).not.toHaveBeenCalled();
    });

    it('offers reminders without a confirmation when nothing was saved', () => {
      const { checkIn, goBack } = setup({
        step: 'ProgressPhotos',
        params: { offerReminders: true },
      });

      checkIn().finish();

      expect(goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).not.toHaveBeenCalled();
      expect(offerReminders).toHaveBeenCalledTimes(1);
    });

    it('only goes back when nothing was saved and no reminder is due', () => {
      const { checkIn, goBack, replace } = setup({ step: 'ProgressPhotos' });

      checkIn().finish();

      expect(goBack).toHaveBeenCalledTimes(1);
      expect(replace).not.toHaveBeenCalled();
      expect(toastShow).not.toHaveBeenCalled();
      expect(offerReminders).not.toHaveBeenCalled();
    });

    it('does nothing while the last step is not focused', () => {
      const { checkIn, goBack, isFocused } = setup({
        step: 'ProgressPhotos',
        params: { saved: true, offerReminders: true },
      });
      isFocused.mockReturnValue(false);

      checkIn().finish();

      expect(goBack).not.toHaveBeenCalled();
      expect(toastShow).not.toHaveBeenCalled();
      expect(offerReminders).not.toHaveBeenCalled();
      expect(dismissSpy).not.toHaveBeenCalled();
      expect(checkIn().hasLeft()).toBe(false);
    });

    it('finishes only once', () => {
      const { checkIn, goBack } = setup({
        step: 'ProgressPhotos',
        params: { saved: true, offerReminders: true },
      });

      checkIn().finish();
      checkIn().finish();
      checkIn().advance();

      expect(goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledTimes(1);
      expect(offerReminders).toHaveBeenCalledTimes(1);
      expect(checkIn().hasLeft()).toBe(true);
    });
  });

  describe('back', () => {
    it('is not offered on the first step', () => {
      const { checkIn } = setup({ step: 'MoodLog' });

      expect(checkIn().back).toBeNull();
    });

    it('reopens the step before with every flag, the created check-in included', () => {
      const moodCheckin = { id: 'checkin-1', date: DATE };
      const { checkIn, replace } = setup({
        step: 'MeasurementsAdd',
        params: { offerReminders: true, saved: true, moodCheckin },
      });

      checkIn().back?.(false);

      expect(alertSpy).not.toHaveBeenCalled();
      expect(replace).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('MoodLog', {
        date: DATE,
        guidedCheckIn: { offerReminders: true, saved: true, moodCheckin },
      });
      expect(dismissSpy).toHaveBeenCalled();
    });

    it('goes from the photos back to the measurements', () => {
      const { checkIn, replace, goBack } = setup({
        step: 'ProgressPhotos',
        params: { saved: true },
      });

      checkIn().back?.(false);

      expect(replace).toHaveBeenCalledWith('MeasurementsAdd', {
        date: DATE,
        guidedCheckIn: { offerReminders: false, saved: true },
      });
      expect(goBack).not.toHaveBeenCalled();
      expect(toastShow).not.toHaveBeenCalled();
    });

    it('asks first when the step has unsaved edits, and stays on Cancel', () => {
      const { checkIn, replace } = setup({ step: 'MeasurementsAdd' });

      checkIn().back?.(true);

      expect(alertSpy).toHaveBeenCalledWith(
        'Go back a step?',
        "Your changes on this step won't be saved.",
        expect.any(Array),
        expect.objectContaining({ cancelable: true })
      );
      pressAlertButton('cancel');
      expect(replace).not.toHaveBeenCalled();

      checkIn().back?.(true);
      pressAlertButton('destructive');
      expect(replace).toHaveBeenCalledWith('MoodLog', {
        date: DATE,
        guidedCheckIn: { offerReminders: false, saved: false },
      });
    });

    it('does nothing while the step is not focused, and only once', () => {
      const { checkIn, replace, isFocused } = setup({
        step: 'MeasurementsAdd',
      });
      isFocused.mockReturnValue(false);

      checkIn().back?.(false);
      expect(replace).not.toHaveBeenCalled();

      isFocused.mockReturnValue(true);
      checkIn().back?.(false);
      checkIn().back?.(false);
      checkIn().advance();
      expect(replace).toHaveBeenCalledTimes(1);
    });
  });

  describe('the check-in in progress', () => {
    const progress = () => useGuidedCheckInStore.getState().progress;

    it('records each hop with the step it opens and its flags', () => {
      const moodCheckin = { id: 'checkin-1', date: DATE };
      const { checkIn } = setup({ step: 'MoodLog' });

      checkIn().advance({ saved: true, offerReminders: true, moodCheckin });

      expect(progress()).toEqual({
        date: DATE,
        step: 'MeasurementsAdd',
        flags: { offerReminders: true, saved: true, moodCheckin },
      });
    });

    it('records the step a Back opens', () => {
      const { checkIn } = setup({
        step: 'ProgressPhotos',
        params: { saved: true },
      });

      checkIn().back?.(false);

      expect(progress()).toEqual({
        date: DATE,
        step: 'MeasurementsAdd',
        flags: { offerReminders: false, saved: true },
      });
    });

    it.each([
      ['Finish', (checkIn: GuidedCheckIn) => checkIn.finish()],
      [
        'a close by the navigator',
        (checkIn: GuidedCheckIn) => checkIn.onNavigatorClose(),
      ],
    ])('is cleared by %s on the last step', (_how, close) => {
      useGuidedCheckInStore.getState().saveProgress({
        date: DATE,
        step: 'ProgressPhotos',
        flags: { saved: true },
      });
      const { checkIn } = setup({
        step: 'ProgressPhotos',
        params: { saved: true },
      });

      close(checkIn());

      expect(progress()).toBeNull();
    });

    it('is kept when a step is left without a hop', () => {
      const saved = {
        date: DATE,
        step: 'MeasurementsAdd' as const,
        flags: { saved: true },
      };
      useGuidedCheckInStore.getState().saveProgress(saved);
      const { checkIn, isFocused } = setup({
        step: 'MeasurementsAdd',
        params: { saved: true },
      });
      isFocused.mockReturnValue(false);

      checkIn().advance();

      expect(progress()).toEqual(saved);
    });
  });

  describe('startGuidedCheckIn', () => {
    const t = ((key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key) as unknown as Parameters<
      typeof startGuidedCheckIn
    >[1];
    const pressAlertText = (text: string) => {
      const buttons = alertSpy.mock.calls.at(-1)?.[2] ?? [];
      const button = buttons.find((b) => b.text === text);
      if (!button) throw new Error(`No ${text} button on the alert`);
      button.onPress?.();
    };
    const left = {
      date: DATE,
      step: 'ProgressPhotos' as const,
      flags: { offerReminders: true, saved: true },
    };

    it('starts at step 1 when nothing is in progress', () => {
      const open = jest.fn();

      startGuidedCheckIn(DATE, t, open);

      expect(alertSpy).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledWith('MoodLog', {});
    });

    it('starts at step 1 when the check-in in progress is for another day', () => {
      useGuidedCheckInStore.getState().saveProgress({
        ...left,
        date: '2026-10-25',
      });
      const open = jest.fn();

      startGuidedCheckIn(DATE, t, open);

      expect(alertSpy).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledWith('MoodLog', {});
    });

    it('asks first for the same day, and Continue opens the step it stopped at', () => {
      useGuidedCheckInStore.getState().saveProgress(left);
      const open = jest.fn();

      startGuidedCheckIn(DATE, t, open);

      expect(open).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith(
        'Continue your check-in?',
        'You stopped at step {{step}} of {{total}}.',
        expect.any(Array),
        expect.objectContaining({ cancelable: true })
      );
      pressAlertText('Continue');

      expect(open).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith('ProgressPhotos', left.flags);
    });

    it('Start over clears it and opens a new check-in at step 1', () => {
      useGuidedCheckInStore.getState().saveProgress(left);
      const open = jest.fn();

      startGuidedCheckIn(DATE, t, open);
      pressAlertText('Start over');

      expect(open).toHaveBeenCalledWith('MoodLog', {});
      expect(useGuidedCheckInStore.getState().progress).toBeNull();
    });

    it('Cancel opens nothing and keeps it', () => {
      useGuidedCheckInStore.getState().saveProgress(left);
      const open = jest.fn();

      startGuidedCheckIn(DATE, t, open);
      pressAlertText('Cancel');

      expect(open).not.toHaveBeenCalled();
      expect(useGuidedCheckInStore.getState().progress).toEqual(left);
    });
  });

  describe('onNavigatorClose', () => {
    it('confirms and offers reminders like finish, without going back itself', () => {
      const { checkIn, goBack, replace } = setup({
        step: 'ProgressPhotos',
        params: { offerReminders: true },
      });

      checkIn().onNavigatorClose({ saved: true });

      expect(goBack).not.toHaveBeenCalled();
      expect(replace).not.toHaveBeenCalled();
      expect(toastShow).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledWith({
        type: 'success',
        text1: 'Check-in complete',
      });
      expect(offerReminders).toHaveBeenCalledTimes(1);
      const [toasted] = toastShow.mock.invocationCallOrder;
      const [offered] = offerReminders.mock.invocationCallOrder;
      expect(toasted).toBeLessThan(offered);
      expect(checkIn().hasLeft()).toBe(true);
    });

    it('confirms nothing when nothing was saved and no reminder is due', () => {
      const { checkIn } = setup({ step: 'ProgressPhotos' });

      checkIn().onNavigatorClose({ saved: false });

      expect(toastShow).not.toHaveBeenCalled();
      expect(offerReminders).not.toHaveBeenCalled();
      expect(checkIn().hasLeft()).toBe(true);
    });

    it('still confirms while the step is losing focus to the close', () => {
      const { checkIn, isFocused } = setup({
        step: 'ProgressPhotos',
        params: { saved: true },
      });
      isFocused.mockReturnValue(false);

      checkIn().onNavigatorClose();

      expect(toastShow).toHaveBeenCalledTimes(1);
    });

    it("does nothing for finish's own goBack, which the navigator reports from inside it", () => {
      const { checkIn, goBack } = setup({
        step: 'ProgressPhotos',
        params: { saved: true, offerReminders: true },
      });
      // React Navigation emits beforeRemove synchronously within goBack.
      goBack.mockImplementation(() =>
        checkIn().onNavigatorClose({ saved: true })
      );

      checkIn().finish();

      expect(goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledTimes(1);
      expect(offerReminders).toHaveBeenCalledTimes(1);
    });

    it('happens only once, and stops a later finish', () => {
      const { checkIn, goBack } = setup({
        step: 'ProgressPhotos',
        params: { saved: true, offerReminders: true },
      });

      checkIn().onNavigatorClose();
      checkIn().onNavigatorClose();
      checkIn().finish();

      expect(goBack).not.toHaveBeenCalled();
      expect(toastShow).toHaveBeenCalledTimes(1);
      expect(offerReminders).toHaveBeenCalledTimes(1);
    });
  });
});
