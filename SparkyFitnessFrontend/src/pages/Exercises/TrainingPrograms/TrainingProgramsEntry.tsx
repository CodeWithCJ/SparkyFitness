import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** The Exercises page's way into the training programs page. */
const TrainingProgramsEntry = () => {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>
          {t('trainingPrograms.entry.title', 'Training programs')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0">
        <p className="text-sm text-muted-foreground">
          {t(
            'trainingPrograms.entry.description',
            'Follow a run or walk plan that builds up week by week, with a calendar and the workout in your Diary.'
          )}
        </p>
        <Button asChild variant="outline">
          <Link to="/exercises/training-programs">
            {t('trainingPrograms.entry.open', 'Open training programs')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

export default TrainingProgramsEntry;
