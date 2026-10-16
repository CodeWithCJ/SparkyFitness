import { Eye, EyeOff } from 'lucide-react';
import { Toggle } from './ui/toggle';

import { useTranslation } from 'react-i18next';
type PasswordToggleProps = {
  showPassword: boolean;
  passwordToggleHandler: () => void;
};

const PasswordToggle: React.FC<PasswordToggleProps> = ({
  showPassword,
  passwordToggleHandler,
}) => {
  const { t } = useTranslation();
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={showPassword}
      onPressedChange={passwordToggleHandler}
      className="absolute right-2 top-11 -translate-y-1/2"
      aria-label={t(
        'passwordToggle.togglePasswordVisibility',
        'Toggle password visibility'
      )}
    >
      {showPassword ? (
        <EyeOff className="w-4 h-4" />
      ) : (
        <Eye className="w-4 h-4" />
      )}
    </Toggle>
  );
};

export default PasswordToggle;
