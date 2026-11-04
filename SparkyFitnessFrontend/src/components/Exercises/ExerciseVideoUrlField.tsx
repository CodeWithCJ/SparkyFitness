import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { normalizeExerciseVideoUrl } from '@workspace/shared';
import ExerciseVideo from './ExerciseVideo';

interface ExerciseVideoUrlFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  exerciseName: string;
}

/**
 * The demonstration video link on the exercise forms, with an inline preview
 * so the person can check the clip before saving.
 */
const ExerciseVideoUrlField = ({
  id,
  value,
  onChange,
  exerciseName,
}: ExerciseVideoUrlFieldProps) => {
  const { t } = useTranslation();
  // Blank (clears) or an http(s) link can be saved.
  const invalid = normalizeExerciseVideoUrl(value) === undefined;

  return (
    <div className="grid grid-cols-4 items-start gap-4">
      <Label htmlFor={id} className="text-right mt-2">
        {t('exercise.video.label', 'Video link')}
      </Label>
      <div className="col-span-3 space-y-2">
        <Input
          id={id}
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(
            'exercise.video.placeholder',
            'https://youtube.com/shorts/…'
          )}
          aria-invalid={invalid}
        />
        {invalid ? (
          <p className="text-sm text-destructive">
            {t('exercise.video.invalid', 'Enter a link starting with https://')}
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {t(
                'exercise.video.help',
                'A short demonstration clip. YouTube links play right in the workout.'
              )}
            </p>
            <ExerciseVideo url={value} title={exerciseName} />
          </>
        )}
      </div>
    </div>
  );
};

export default ExerciseVideoUrlField;
