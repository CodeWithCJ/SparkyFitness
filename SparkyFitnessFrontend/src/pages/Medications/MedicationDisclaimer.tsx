import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldAlert, Pill, AlertTriangle } from 'lucide-react';

interface MedicationDisclaimerProps {
  onAccept: () => void;
}

export default function MedicationDisclaimer({
  onAccept,
}: MedicationDisclaimerProps) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4 max-w-lg mx-auto">
      <Card className="w-full shadow-lg border">
        <CardHeader className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <Pill className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t('medications.disclaimer.badge', 'Medication Tracker')}
            </span>
          </div>
          <CardTitle className="text-xl font-bold">
            {t('medications.disclaimer.title', 'Before You Begin')}
          </CardTitle>
          <CardDescription>
            {t(
              'medications.disclaimer.subtitle',
              'Please read and acknowledge the following before using the medication tracker.'
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 py-4">
          {/* Disclaimer block */}
          <div className="space-y-3 bg-destructive/5 dark:bg-destructive/10 p-4 rounded-xl border border-destructive/20">
            <div className="flex gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-2 text-xs text-foreground">
                <p className="font-semibold text-sm text-destructive">
                  {t(
                    'medications.disclaimer.healthTitle',
                    'Important Health Disclaimer'
                  )}
                </p>
                <p className="leading-relaxed">
                  {t(
                    'medications.disclaimer.text1',
                    'This medication tracking feature is intended for personal record-keeping and informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment.'
                  )}
                </p>
                <p className="leading-relaxed">
                  {t(
                    'medications.disclaimer.text2',
                    'Always consult your physician, pharmacist, or other qualified healthcare provider before starting, stopping, or changing any medication. Never disregard professional medical advice or delay seeking it because of information provided by this tracker.'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Reminder block */}
          <div className="space-y-3 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-xl border border-amber-200 dark:border-amber-900/50">
            <div className="flex gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2 text-xs text-foreground">
                <p className="font-semibold text-sm text-amber-800 dark:text-amber-200">
                  {t(
                    'medications.disclaimer.reminderTitle',
                    'Reminders Are Not Medical Alerts'
                  )}
                </p>
                <p className="leading-relaxed text-amber-700/90 dark:text-amber-300/80">
                  {t(
                    'medications.disclaimer.text3',
                    'Schedule reminders and adherence tracking are convenience features. They may not account for drug interactions, contraindications, or dosage adjustments required by your care team. You are solely responsible for taking medications as prescribed.'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Acknowledgement checkbox */}
          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30 select-none">
            <Checkbox
              id="med-disclaimer-accept"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(!!checked)}
              className="mt-0.5"
            />
            <label
              htmlFor="med-disclaimer-accept"
              className="text-xs leading-relaxed text-foreground cursor-pointer"
            >
              {t(
                'medications.disclaimer.acknowledge',
                'I understand that this tracker is not a medical device and does not provide medical advice. I will consult my healthcare provider for all medication-related decisions.'
              )}
            </label>
          </div>
        </CardContent>

        <CardFooter className="flex justify-end border-t pt-4">
          <Button
            onClick={onAccept}
            disabled={!accepted}
            className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
          >
            {t('medications.disclaimer.accept', 'Agree & Continue')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
