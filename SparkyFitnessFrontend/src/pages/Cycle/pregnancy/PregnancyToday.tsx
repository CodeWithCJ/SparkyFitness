import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePregnancyOverview } from '@/hooks/usePregnancy';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Baby,
  Timer,
  ListChecks,
  Apple,
  Sprout,
  Camera,
  HeartPulse,
} from 'lucide-react';
import WeekBanner from './WeekBanner';
import BabyGrowthView from './BabyGrowthView';
import KickCounter from './KickCounter';
import ContractionTimer from './ContractionTimer';
import WeeklyChecklist from './WeeklyChecklist';
import FoodMedSafetySearch from './FoodMedSafetySearch';
import PregnancySetup from './PregnancySetup';
import BumpPhotoJournal from './BumpPhotoJournal';
import VitalsCard from './VitalsCard';
import type { ChecklistItem } from './pregnancyTypes';

type Tool =
  | 'growth'
  | 'kicks'
  | 'contractions'
  | 'checklist'
  | 'safety'
  | 'photos'
  | 'vitals';

const TOOLS: {
  id: Tool;
  icon: typeof Baby;
  labelKey: string;
  label: string;
}[] = [
  {
    id: 'growth',
    icon: Sprout,
    labelKey: 'pregnancy.tiles.growth',
    label: 'Baby growth',
  },
  {
    id: 'kicks',
    icon: Baby,
    labelKey: 'pregnancy.tiles.kicks',
    label: 'Kick counter',
  },
  {
    id: 'contractions',
    icon: Timer,
    labelKey: 'pregnancy.tiles.contractions',
    label: 'Contractions',
  },
  {
    id: 'photos',
    icon: Camera,
    labelKey: 'pregnancy.tiles.photos',
    label: 'Bump photo',
  },
  {
    id: 'safety',
    icon: Apple,
    labelKey: 'pregnancy.tiles.safety',
    label: 'Food & meds',
  },
  {
    id: 'vitals',
    icon: HeartPulse,
    labelKey: 'pregnancy.tiles.vitals',
    label: 'Vitals',
  },
  {
    id: 'checklist',
    icon: ListChecks,
    labelKey: 'pregnancy.tiles.checklist',
    label: 'Checklist',
  },
];

export default function PregnancyToday() {
  const { t } = useTranslation();
  const { data: overview, isLoading } = usePregnancyOverview();
  const [tool, setTool] = useState<Tool>('growth');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl bg-muted/40" />
        <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  // No active pregnancy yet → run the setup wizard.
  if (!overview?.pregnancy || !overview.gestation) {
    return <PregnancySetup />;
  }

  const { pregnancy, gestation, baby, checklist, checklistProgress } = overview;
  const dueDate = String(pregnancy.due_date).slice(0, 10);
  const pregnancyId = pregnancy.id!;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Progress Banner, Teaser, & Quick-Action Tiles */}
        <div className="lg:col-span-5 space-y-5">
          <WeekBanner gestation={gestation} dueDate={dueDate} />

          {/* Baby size teaser */}
          {baby ? (
            <Card
              className="cursor-pointer transition hover:bg-muted/30"
              onClick={() => setTool('growth')}
            >
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('pregnancy.today.babyThisWeek', 'Baby this week')}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold">
                    {baby.comparison}
                  </p>
                  {baby.lengthCm != null ? (
                    <p className="text-xs text-muted-foreground">
                      ≈ {baby.lengthCm} cm
                      {baby.weightG != null ? ` · ${baby.weightG} g` : ''}
                    </p>
                  ) : null}
                </div>
                <Sprout className="h-8 w-8 text-primary/70" />
              </CardContent>
            </Card>
          ) : null}

          {/* Quick-action tiles */}
          <div className="grid grid-cols-4 gap-2">
            {TOOLS.map((tl) => {
              const Icon = tl.icon;
              return (
                <button
                  key={tl.id}
                  type="button"
                  onClick={() => setTool(tl.id)}
                  aria-pressed={tool === tl.id}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] transition',
                    tool === tl.id
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'border-transparent bg-muted/40 hover:bg-muted'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-center leading-tight">
                    {t(tl.labelKey, tl.label)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Tool Detail View */}
        <div className="lg:col-span-7 space-y-5">
          {tool === 'growth' ? (
            <BabyGrowthView currentWeek={gestation.week} />
          ) : null}
          {tool === 'kicks' ? (
            <KickCounter
              pregnancyId={pregnancyId}
              recentSessions={overview.recentKickSessions}
            />
          ) : null}
          {tool === 'contractions' ? (
            <ContractionTimer pregnancyId={pregnancyId} />
          ) : null}
          {tool === 'photos' ? (
            <BumpPhotoJournal
              pregnancyId={pregnancyId}
              currentWeek={gestation.week}
            />
          ) : null}
          {tool === 'vitals' ? (
            <VitalsCard
              pregnancyId={pregnancyId}
              vitals={overview.vitals ?? null}
              date={overview.date ?? ''}
            />
          ) : null}
          {tool === 'checklist' ? (
            <WeeklyChecklist
              pregnancyId={pregnancyId}
              week={gestation.week}
              items={(checklist ?? []) as ChecklistItem[]}
              progress={checklistProgress ?? { done: 0, total: 0 }}
            />
          ) : null}
          {tool === 'safety' ? <FoodMedSafetySearch /> : null}
        </div>
      </div>

      <p className="pb-4 text-center text-xs text-muted-foreground">
        {t(
          'pregnancy.disclaimer',
          'Pregnancy information is educational and not a substitute for medical care.'
        )}
      </p>
    </div>
  );
}
