import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useShoes } from '@/hooks/Shoes/useShoes';

const NO_SHOE = 'none';

interface ShoeSelectProps {
  /** Selected shoe id, or null for "no shoe". */
  value: string | null;
  onChange: (shoeId: string | null) => void;
  disabled?: boolean;
  id?: string;
}

/** Picker over the user's active pairs; a retired pair stays selectable only while it is the current value. */
export const ShoeSelect: React.FC<ShoeSelectProps> = ({
  value,
  onChange,
  disabled,
  id,
}) => {
  const { t } = useTranslation();
  const { data: shoes = [] } = useShoes();
  const options = shoes.filter(
    (shoe) => shoe.status === 'active' || shoe.id === value
  );

  return (
    <Select
      value={value ?? NO_SHOE}
      onValueChange={(next) => onChange(next === NO_SHOE ? null : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={t('shoes.noShoe', 'No shoe')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_SHOE}>{t('shoes.noShoe', 'No shoe')}</SelectItem>
        {options.map((shoe) => (
          <SelectItem key={shoe.id} value={shoe.id}>
            {shoe.nickname || shoe.name}
            {shoe.status === 'retired'
              ? ` (${t('shoes.retired', 'Retired')})`
              : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
