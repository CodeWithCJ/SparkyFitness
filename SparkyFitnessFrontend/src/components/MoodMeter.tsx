import React from 'react';
import { useTranslation } from "react-i18next";
import { Slider } from '@/components/ui/slider'; // Assuming Shadcn UI Slider
import { Textarea } from '@/components/ui/textarea'; // Assuming Shadcn UI Textarea
import { Label } from '@/components/ui/label'; // Assuming Shadcn UI Label
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // Assuming Shadcn UI Card

interface MoodMeterProps {
  onMoodChange: (mood: number | null, notes: string) => void;
  initialMood?: number | null;
  initialNotes?: string;
}

const MoodMeter: React.FC<MoodMeterProps> = ({ onMoodChange, initialMood = null, initialNotes = '' }) => {
  const { t } = useTranslation();
  const [mood, setMood] = React.useState<number | null>(initialMood);
  const [notes, setNotes] = React.useState<string>(initialNotes);

  React.useEffect(() => {
    setMood(initialMood);
    setNotes(initialNotes);
  }, [initialMood, initialNotes]);

  const handleMoodChange = (value: number[]) => {
    const newMood = value[0];
    setMood(newMood);
    onMoodChange(newMood, notes);
  };

  const handleNotesChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newNotes = event.target.value;
    setNotes(newNotes);
    onMoodChange(mood, newNotes);
  };

  const getMoodDisplay = (value: number | null) => {
    if (value === null) return { emoji: '😐', label: t('moodMeter.neutral', 'Neutral') }; //default/null
    if (value == 10) return { emoji: '😴', label: t('moodMeter.tired', 'Tired') }; //0
    if (value <= 20) return { emoji: '😢', label: t('moodMeter.sad', 'Sad') }; //0-10
    if (value <= 30) return { emoji: '😠', label: t('moodMeter.angry', 'Angry') }; //11-20
    if (value <= 40) return { emoji: '😟', label: t('moodMeter.worried', 'Worried') }; //21-30
    if (value <= 50) return { emoji: '😐', label: t('moodMeter.neutral', 'Neutral') }; //31-40
    if (value <= 60) return { emoji: '🤔', label: t('moodMeter.thoughtful', 'Thoughtful') }; //41-50
    if (value <= 70) return { emoji: '🙂', label: t('moodMeter.calm', 'Calm') }; //51-60
    if (value <= 80) return { emoji: '😎', label: t('moodMeter.confident', 'Confident') }; //61-70
    if (value <= 90) return { emoji: '😀', label: t('moodMeter.happy', 'Happy') }; //71-80
    return { emoji: '😍', label: t('moodMeter.excited', 'Excited') }; //>=81
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('moodMeter.howAreYouFeelingToday', 'How are you feeling today?')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-4 mb-4">
          <span className="text-4xl">{getMoodDisplay(mood).emoji}</span>
          <Slider
            value={[mood === null ? 50 : mood]}
            min={10}
            max={100}
            step={10}
            onValueChange={handleMoodChange}
            className="w-full"
          />
        </div>
        <div className="text-center text-lg font-semibold mb-4">
          {getMoodDisplay(mood).label}
        </div>
        <div>
          <Label htmlFor="mood-notes">{t('checkIn.notesOptional', 'Notes (optional)')}</Label>
          <Textarea
            id="mood-notes"
            placeholder={t('checkIn.anyThoughtsOrFeelings', "Any thoughts or feelings you'd like to add?")}
            value={notes}
            onChange={handleNotesChange}
            className="mt-2"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default MoodMeter;