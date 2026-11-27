import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChoiceFeatureKey } from '@workspace/shared';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useSetWebFeatureChoice } from '@/hooks/Settings/useFeatureChoices';
import { useWebFeatures } from '@/hooks/Settings/useWebFeatures';
import { choiceFeatureLabel } from '@/constants/webTabs';
import { FeatureOffNotice } from './FeatureOffNotice';

/**
 * The page of a feature switched per platform (#3487), or its tab on a shared
 * page (Reports > Medications). While the person turned it off on this
 * website, a link or bookmark to it shows a notice to turn it back on instead
 * of the page; tabs and menus already leave it out. While the
 * choices load, or when they could not be read, the default applies.
 *
 * Someone acting for the person sees the page as their permissions allow: the
 * switch is about the person's own website, and only they can change it.
 */
export function FeatureRoute({
  feature,
  children,
}: {
  feature: ChoiceFeatureKey;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { isActingOnBehalf } = useActiveUser();
  const { isEnabled } = useWebFeatures();
  const choice = useSetWebFeatureChoice();

  if (isActingOnBehalf || isEnabled(feature)) return <>{children}</>;

  return (
    <div className="p-4">
      <FeatureOffNotice
        name={choiceFeatureLabel(t, feature)}
        onTurnOn={() => choice.setFeatureOn(feature, true)}
        turningOn={choice.isPending || choice.state !== 'ready'}
      />
    </div>
  );
}
