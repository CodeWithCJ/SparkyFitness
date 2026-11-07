import { useState } from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { useEnergyUnit } from '../../src/hooks/useEnergyUnit';
import { useEnergyInputText } from '../../src/hooks/useEnergyInputText';

/** A form field the way the screens use it: the form state holds kcal text. */
function useField(initialKcal: string) {
  const [kcal, setKcal] = useState(initialKcal);
  const input = useEnergyInputText(kcal, setKcal);
  return { kcal, setKcal, ...input };
}

describe('useEnergyInputText', () => {
  afterEach(() => {
    jest.mocked(useEnergyUnit).mockReturnValue('kcal');
  });

  test('is a plain pass-through in kcal', () => {
    const { result } = renderHook(() => useField('250'));
    expect(result.current.text).toBe('250');
    act(() => result.current.onChangeText('260'));
    expect(result.current.kcal).toBe('260');
    expect(result.current.text).toBe('260');
  });

  test('shows kJ and keeps the form in kcal', () => {
    jest.mocked(useEnergyUnit).mockReturnValue('kJ');
    const { result } = renderHook(() => useField('100'));
    expect(result.current.text).toBe('418');

    act(() => result.current.onChangeText('836.8'));
    expect(result.current.kcal).toBe('200');
    // What the user typed stays as typed, not re-rounded under them.
    expect(result.current.text).toBe('836.8');

    act(() => result.current.onChangeText('12.'));
    expect(result.current.text).toBe('12.');

    // A change from outside (a reset, a scaled serving) rewrites the text.
    act(() => result.current.setKcal('50'));
    expect(result.current.text).toBe('209');
  });
});
