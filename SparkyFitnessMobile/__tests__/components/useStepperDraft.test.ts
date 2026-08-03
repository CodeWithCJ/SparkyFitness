import { act, renderHook } from '@testing-library/react-native';

import { useStepperDraft } from '../../src/components/StepperInput';

/** Renders the hook against a value the caller keeps committing back in. */
function renderStepper(initial: number, min = 15, max = 90) {
  const commits: number[] = [];
  const hook = renderHook(
    ({ value }: { value: number }) =>
      useStepperDraft({
        value,
        min,
        max,
        onCommit: (next) => commits.push(next),
      }),
    { initialProps: { value: initial } }
  );
  return { ...hook, commits };
}

describe('useStepperDraft', () => {
  it('shows a partial entry below the minimum without committing it', () => {
    const { result, commits } = renderStepper(28);

    act(() => result.current.onChangeText('2'));

    expect(result.current.value).toBe('2');
    expect(commits).toEqual([]);
  });

  it('commits once the typed value reaches the accepted range', () => {
    const { result, commits, rerender } = renderStepper(28);

    act(() => result.current.onChangeText('3'));
    act(() => result.current.onChangeText('30'));
    rerender({ value: 30 });

    expect(commits).toEqual([30]);
    expect(result.current.value).toBe('30');
  });

  it('clamps a still-out-of-range draft to the nearest bound on blur', () => {
    const { result, commits } = renderStepper(28);

    act(() => result.current.onChangeText('2'));
    act(() => result.current.onBlur());

    expect(commits).toEqual([15]);
  });

  it('clamps above the maximum on blur', () => {
    const { result, commits } = renderStepper(28);

    act(() => result.current.onChangeText('120'));
    act(() => result.current.onBlur());

    expect(commits).toEqual([90]);
  });

  it('restores the committed value when the field is left empty', () => {
    const { result, commits } = renderStepper(28);

    act(() => result.current.onChangeText(''));
    expect(result.current.value).toBe('');

    act(() => result.current.onBlur());

    expect(commits).toEqual([]);
    expect(result.current.value).toBe('28');
  });

  it('clears an optional field when it is left empty', () => {
    const onCommit = jest.fn();
    const onClear = jest.fn();
    const { result } = renderHook(() =>
      useStepperDraft({
        value: 28,
        min: 15,
        max: 90,
        onCommit,
        onClear,
      })
    );

    act(() => result.current.onChangeText(''));
    act(() => result.current.onBlur());

    expect(onCommit).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(result.current.value).toBe('28');
  });

  it('ignores non-digit input', () => {
    const { result, commits } = renderStepper(28);

    act(() => result.current.onChangeText('2a'));

    expect(result.current.value).toBe('28');
    expect(commits).toEqual([]);
  });

  it('steps from the committed value and stops at the bounds', () => {
    const { result, commits, rerender } = renderStepper(89);

    act(() => result.current.onIncrement());
    rerender({ value: 90 });
    act(() => result.current.onIncrement());

    expect(commits).toEqual([90]);
  });

  it('steps from an in-progress draft rather than the committed value', () => {
    const { result, commits } = renderStepper(28);

    act(() => result.current.onChangeText('40'));
    act(() => result.current.onIncrement());

    expect(commits).toEqual([40, 41]);
  });
});
