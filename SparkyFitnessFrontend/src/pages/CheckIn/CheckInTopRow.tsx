import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MoodMeter from './MoodMeter';
import HomeDashboardFasting from './HomeDashboardFasting';
import { useTranslation } from 'react-i18next';

interface CheckInTopRowProps {
  mood: number;
  moodNotes: string;
  setMood: (value: number) => void;
  setMoodNotes: (value: string) => void;
}
export const CheckInTopRow = ({
  mood,
  moodNotes,
  setMood,
  setMoodNotes,
}: CheckInTopRowProps) => {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
        <div className="w-full h-full">
          <HomeDashboardFasting />
        </div>

        <div className="w-full h-full">
          <Card>
            <CardHeader>
              <CardTitle>
                {t(
                  'checkIn.howAreYouFeelingToday',
                  'How are you feeling today?'
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MoodMeter
                mood={mood}
                notes={moodNotes}
                onMoodChange={setMood}
                onNotesChange={setMoodNotes}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};
