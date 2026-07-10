import { Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Toggle } from './ui/toggle';

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
      className="absolute end-2 top-11 -translate-y-1/2"
      aria-label={
        showPassword
          ? t('auth.hidePassword', 'Hide password')
          : t('auth.showPassword', 'Show password')
      }
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
