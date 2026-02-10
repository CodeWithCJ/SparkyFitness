import { Eye, EyeOff } from 'lucide-react';
import { Toggle } from './ui/toggle';

type PasswordToggleProps = {
  showPassword: boolean;
  passwordToggleHandler: () => void;
};

const PasswordToggle: React.FC<PasswordToggleProps> = ({
  showPassword,
  passwordToggleHandler,
}) => {
  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={showPassword}
      onPressedChange={passwordToggleHandler}
      className="absolute right-2 top-11 -translate-y-1/2"
      aria-label="Toggle password visibility"
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
