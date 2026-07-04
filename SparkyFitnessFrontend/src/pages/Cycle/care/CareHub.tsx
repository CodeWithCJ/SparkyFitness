import { useTranslation } from 'react-i18next';
import type { CycleMode } from '@workspace/shared';
import ArticleLibrary from './ArticleLibrary';
import AppointmentsPanel from './AppointmentsPanel';
import BirthPrep from './BirthPrep';
import DoctorReport from './DoctorReport';

interface CareHubProps {
  mode: CycleMode;
}

export default function CareHub({ mode }: CareHubProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t(
          'cycle.care.intro',
          'Articles, appointments, and prep — all stored on your own server.'
        )}
      </p>

      <AppointmentsPanel />

      {mode === 'pregnant' ? <BirthPrep /> : <DoctorReport />}

      <ArticleLibrary mode={mode} />
    </div>
  );
}
