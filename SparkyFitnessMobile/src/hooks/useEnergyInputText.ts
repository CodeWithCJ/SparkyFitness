import { useState } from 'react';
import { useEnergyUnit } from './useEnergyUnit';
import {
  displayTextToKcalText,
  kcalTextToDisplayText,
} from '../utils/energyUnit';

/**
 * Binds a text input to a value the caller keeps in kcal, showing and
 * accepting it in the account's energy unit. In kcal the text passes through
 * untouched. What the user types is kept as typed (so "12." or a cleared field
 * does not jump), and only a change from outside, such as a reset or a scaled
 * serving, rewrites the text.
 */
export function useEnergyInputText(
  kcalText: string,
  onChangeKcalText: (kcalText: string) => void
): { text: string; onChangeText: (text: string) => void } {
  const energyUnit = useEnergyUnit();
  const [synced, setSynced] = useState({ kcalText, energyUnit });
  const [text, setText] = useState(() =>
    kcalTextToDisplayText(kcalText, energyUnit)
  );

  // Adjust state during render when the value changed outside this input.
  if (synced.kcalText !== kcalText || synced.energyUnit !== energyUnit) {
    setSynced({ kcalText, energyUnit });
    setText(kcalTextToDisplayText(kcalText, energyUnit));
  }

  const onChangeText = (next: string) => {
    const nextKcal = displayTextToKcalText(next, energyUnit);
    setText(next);
    setSynced({ kcalText: nextKcal, energyUnit });
    onChangeKcalText(nextKcal);
  };

  return { text, onChangeText };
}
