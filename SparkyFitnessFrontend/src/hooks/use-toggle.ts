import { useState } from 'react';

/**
 * Custom hook for managing toggle state.
 * @returns {object} An object containing the toggle state, toggle handler function and state setter function.
 */

const useToggle = (): {
  isToggled: boolean;
  toggleHandler: () => void;
  setIsToggled: React.Dispatch<React.SetStateAction<boolean>>;
} => {
  const [isToggled, setIsToggled] = useState<boolean>(false);

  const toggleHandler = () => {
    setIsToggled((prev) => !prev);
  };

  return { isToggled, toggleHandler, setIsToggled };
};

export default useToggle;
