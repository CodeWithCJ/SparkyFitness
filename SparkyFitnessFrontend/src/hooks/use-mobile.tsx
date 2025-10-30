import * as React from "react"
import { debug, info, warn, error } from '@/utils/logging';
import { usePreferences } from "@/contexts/PreferencesContext";

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, "useIsMobile: Initializing useIsMobile hook.");

  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    info(loggingLevel, "useIsMobile: useEffect triggered for mobile breakpoint listener.");
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = (e: MediaQueryListEvent) => {
      const newIsMobile = e.matches;
      debug(loggingLevel, "useIsMobile: Media query changed, new isMobile:", newIsMobile);
      setIsMobile(newIsMobile);
    }
    mql.addEventListener("change", onChange)
    const initialIsMobile = mql.matches;
    debug(loggingLevel, "useIsMobile: Initial isMobile state:", initialIsMobile);
    setIsMobile(initialIsMobile);
    return () => {
      info(loggingLevel, "useIsMobile: Cleaning up media query listener.");
      mql.removeEventListener("change", onChange);
    };
  }, [loggingLevel]); // Add loggingLevel to dependency array

  return !!isMobile
}
