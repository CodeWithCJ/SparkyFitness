import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  COACH_DIET_TYPES,
  COACH_TONES,
  type CoachSettingsResponse,
} from '@workspace/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateCoachProfile } from '@/hooks/Coaches/useCoaches';

const NONE = 'none';

interface Props {
  profile: CoachSettingsResponse['profile'];
  allergens: string[];
}

/** The shared "About me": what every coach, and Sparky chat, knows about the person. */
export function AboutMeCard({ profile, allergens }: Props) {
  const { t } = useTranslation();
  const save = useUpdateCoachProfile();
  const [diet, setDiet] = useState<string>(profile.diet_type ?? NONE);
  const [tone, setTone] = useState<string>(profile.tone ?? NONE);
  const [avoid, setAvoid] = useState(profile.foods_avoid ?? '');
  const [prefer, setPrefer] = useState(profile.foods_prefer ?? '');
  const [notes, setNotes] = useState(profile.notes ?? '');

  const body = () => ({
    diet_type:
      diet === NONE ? null : (diet as (typeof COACH_DIET_TYPES)[number]),
    tone: tone === NONE ? null : (tone as (typeof COACH_TONES)[number]),
    foods_avoid: avoid.trim() || null,
    foods_prefer: prefer.trim() || null,
    notes: notes.trim() || null,
  });

  const clearAll = () => {
    setDiet(NONE);
    setTone(NONE);
    setAvoid('');
    setPrefer('');
    setNotes('');
    save.mutate({
      diet_type: null,
      tone: null,
      foods_avoid: null,
      foods_prefer: null,
      notes: null,
    });
  };

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div>
        <h3 className="text-sm font-semibold">
          {t('coaches.aboutMe.title', 'About me')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'coaches.aboutMe.description',
            'Your coaches and Sparky chat use this. You can change or clear it any time.'
          )}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="coach-diet">
            {t('coaches.aboutMe.diet', 'Diet')}
          </Label>
          <Select value={diet} onValueChange={setDiet}>
            <SelectTrigger id="coach-diet">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>
                {t('coaches.aboutMe.notSet', 'Not set')}
              </SelectItem>
              {COACH_DIET_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`coaches.diets.${value}`, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coach-tone">
            {t('coaches.aboutMe.tone', 'Tone')}
          </Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger id="coach-tone">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>
                {t('coaches.aboutMe.notSet', 'Not set')}
              </SelectItem>
              {COACH_TONES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`coaches.tones.${value}`, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coach-avoid">
            {t('coaches.aboutMe.foodsAvoid', 'Foods to avoid')}
          </Label>
          <Input
            id="coach-avoid"
            value={avoid}
            maxLength={500}
            onChange={(event) => setAvoid(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coach-prefer">
            {t('coaches.aboutMe.foodsPrefer', 'Foods I like')}
          </Label>
          <Input
            id="coach-prefer"
            value={prefer}
            maxLength={500}
            onChange={(event) => setPrefer(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="coach-notes">
          {t('coaches.aboutMe.notes', 'Anything else coaches should know')}
        </Label>
        <Textarea
          id="coach-notes"
          value={notes}
          maxLength={1000}
          rows={3}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>{t('coaches.aboutMe.allergies', 'Allergies')}</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {allergens.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              {t('coaches.aboutMe.noAllergies', 'None saved.')}
            </span>
          ) : (
            allergens.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'coaches.aboutMe.allergiesHint',
            'Managed in Settings → Nutrition & Diet → Allergen preferences.'
          )}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => save.mutate(body())} disabled={save.isPending}>
          {t('common.save', 'Save')}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={save.isPending}>
              {t('coaches.aboutMe.clear', 'Clear all')}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('coaches.aboutMe.clearTitle', 'Clear About me?')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t(
                  'coaches.aboutMe.clearDescription',
                  'Your diet, tone, foods and notes are removed for every coach and for Sparky chat. Allergies are not affected.'
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t('common.cancel', 'Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction onClick={clearAll}>
                {t('coaches.aboutMe.clear', 'Clear all')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
