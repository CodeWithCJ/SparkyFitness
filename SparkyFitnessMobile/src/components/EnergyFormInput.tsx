import { forwardRef } from 'react';
import type { TextInput } from 'react-native';
import FormInput from './FormInput';
import { useEnergyInputText } from '../hooks/useEnergyInputText';

type FormInputProps = React.ComponentProps<typeof FormInput>;

interface EnergyFormInputProps extends Omit<
  FormInputProps,
  'value' | 'onChangeText'
> {
  /** The value in kcal, as the form keeps it. */
  kcalValue: string;
  /** Receives the edited value in kcal. */
  onChangeKcal: (kcalText: string) => void;
}

/**
 * A `FormInput` for an energy value: the form keeps kcal, the field shows and
 * takes the account's unit (see `useEnergyInputText`).
 */
const EnergyFormInput = forwardRef<TextInput, EnergyFormInputProps>(
  ({ kcalValue, onChangeKcal, ...rest }, ref) => {
    const { text, onChangeText } = useEnergyInputText(kcalValue, onChangeKcal);
    return (
      <FormInput ref={ref} {...rest} value={text} onChangeText={onChangeText} />
    );
  }
);

EnergyFormInput.displayName = 'EnergyFormInput';

export default EnergyFormInput;
