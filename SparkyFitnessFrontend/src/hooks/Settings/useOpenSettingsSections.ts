import { useCallback, useState } from 'react';

/** The element id of a Settings section, so it can be scrolled into view. */
export const settingsSectionElementId = (id: string) =>
  `settings-section-${id}`;

/**
 * The open sections of a Settings accordion. The section the address names
 * (`?section=`) opens on arrival and each time a link names it again, and
 * `openSection` opens one from inside the page and brings it into view (Manage
 * in Tabs opens Features), which a link to the page it is already on could not.
 */
export function useOpenSettingsSections(
  section: string | null,
  navigationKey: string
) {
  const [openSections, setOpenSections] = useState<string[]>(
    section ? [section] : []
  );
  const [seenNavigation, setSeenNavigation] = useState(navigationKey);
  if (seenNavigation !== navigationKey) {
    setSeenNavigation(navigationKey);
    if (section && !openSections.includes(section)) {
      setOpenSections([...openSections, section]);
    }
  }

  const openSection = useCallback((id: string) => {
    setOpenSections((open) => (open.includes(id) ? open : [...open, id]));
    requestAnimationFrame(() =>
      document
        .getElementById(settingsSectionElementId(id))
        ?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    );
  }, []);

  return { openSections, setOpenSections, openSection };
}
