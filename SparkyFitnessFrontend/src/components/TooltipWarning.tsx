import type React from 'react';

import { useTranslation } from 'react-i18next';
const TooltipWarning: React.FC<{ warningMsg: string; color?: string }> = ({
  warningMsg,
  color = 'yellow',
}) => {
  const { t } = useTranslation();
  return (
    <div
      className={`bg-${color}-100 border-l-4 border-${color}-500 text-${color}-800 p-3 rounded`}
    >
      <strong>{t('tooltipWarning.note', 'Note:')}</strong> {warningMsg}
    </div>
  );
};

export default TooltipWarning;
