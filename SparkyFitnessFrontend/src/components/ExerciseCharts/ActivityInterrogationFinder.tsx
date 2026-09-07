import { useState, useEffect, useCallback } from 'react';
import { error } from '@/utils/logging';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Calendar, Clock, MapPin } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import type {
  ExerciseActivityQueryResponse,
  ExerciseActivityQueryItem,
} from '@workspace/shared';
import { useTranslation } from 'react-i18next';
import { exerciseDisplayLabel } from '@/utils/exerciseDisplayLabels';

interface ActivityInterrogationFinderProps {
  onQueryFetch?: (params: {
    category?: string;
    distanceStandard?: string;
    searchKeyword?: string;
  }) => Promise<ExerciseActivityQueryResponse>;
}

export const ActivityInterrogationFinder = ({
  onQueryFetch,
}: ActivityInterrogationFinderProps) => {
  const { distanceUnit, loggingLevel } = usePreferences();
  const { t } = useTranslation();
  const isMiles = distanceUnit === 'miles';

  const [distancePreset, setDistancePreset] = useState<string>('half_marathon');
  const [keyword, setKeyword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryResult, setQueryResult] =
    useState<ExerciseActivityQueryResponse | null>(null);

  const executeSearch = useCallback(
    async (preset?: string, kw?: string) => {
      if (!onQueryFetch) return;
      setLoading(true);
      try {
        const res = await onQueryFetch({
          distanceStandard: preset,
          searchKeyword: kw,
        });
        setQueryResult(res);
        setQueryError(null);
      } catch (err) {
        error(loggingLevel, 'Failed to query activities:', err);
        setQueryError(
          t(
            'exerciseAnalytics.finder.loadError',
            'Failed to load activities. Please try again.'
          )
        );
        setQueryResult(null);
      } finally {
        setLoading(false);
      }
    },
    [onQueryFetch, loggingLevel, t]
  );

  useEffect(() => {
    executeSearch('half_marathon', '');
  }, [executeSearch]);

  return (
    <Card className="shadow-sm border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            {t(
              'exerciseAnalytics.finder.title',
              'Activity Interrogation & Distance Search'
            )}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            'exerciseAnalytics.finder.description',
            'Query and compare past activities by distance milestones, routes, or keywords (e.g. Half Marathons, 10ks, 5ks).'
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:w-56">
            <Select
              value={distancePreset}
              onValueChange={(val) => {
                setDistancePreset(val);
                executeSearch(val, keyword);
              }}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue
                  placeholder={t(
                    'exerciseAnalytics.finder.distanceMilestone',
                    'Distance Milestone'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('exerciseAnalytics.finder.allDistances', 'All Distances')}
                </SelectItem>
                <SelectItem value="5k">
                  {isMiles
                    ? t('exerciseAnalytics.finder.fiveKMiles', '5K (3.1 mi)')
                    : t('exerciseAnalytics.finder.fiveKKm', '5 km')}
                </SelectItem>
                <SelectItem value="10k">
                  {isMiles
                    ? t('exerciseAnalytics.finder.tenKMiles', '10K (6.2 mi)')
                    : t('exerciseAnalytics.finder.tenKKm', '10 km')}
                </SelectItem>
                <SelectItem value="15k">
                  {isMiles
                    ? t(
                        'exerciseAnalytics.finder.fifteenKMiles',
                        '15K (9.3 mi)'
                      )
                    : t('exerciseAnalytics.finder.fifteenKKm', '15 km')}
                </SelectItem>
                <SelectItem value="half_marathon">
                  {isMiles
                    ? t(
                        'exerciseAnalytics.finder.halfMarathonMiles',
                        'Half Marathon (13.1 mi)'
                      )
                    : t(
                        'exerciseAnalytics.finder.halfMarathonKm',
                        'Half Marathon (21.1 km)'
                      )}
                </SelectItem>
                <SelectItem value="marathon">
                  {isMiles
                    ? t(
                        'exerciseAnalytics.finder.marathonMiles',
                        'Marathon (26.2 mi)'
                      )
                    : t(
                        'exerciseAnalytics.finder.marathonKm',
                        'Marathon (42.2 km)'
                      )}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative flex-1 w-full">
            <Input
              type="text"
              placeholder={t(
                'exerciseAnalytics.finder.searchPlaceholder',
                'Search by notes or workout title...'
              )}
              className="text-xs h-9 pl-8"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') executeSearch(distancePreset, keyword);
              }}
            />
            <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-2.5" />
          </div>

          <Button
            size="sm"
            className="h-9 text-xs px-4 w-full sm:w-auto"
            disabled={loading}
            onClick={() => executeSearch(distancePreset, keyword)}
          >
            {loading
              ? t('exerciseAnalytics.finder.querying', 'Querying...')
              : t('exerciseAnalytics.finder.search', 'Search')}
          </Button>
        </div>

        {/* Results List */}
        <div className="space-y-2 mt-3">
          {queryError ? (
            <div className="text-center py-8 text-xs text-destructive border border-destructive/30 rounded-lg bg-destructive/5">
              {queryError}
            </div>
          ) : loading ? (
            <div className="text-center py-8 text-xs text-muted-foreground border rounded-lg bg-muted/20">
              {t(
                'exerciseAnalytics.finder.searching',
                'Searching activity database...'
              )}
            </div>
          ) : queryResult && queryResult.items.length > 0 ? (
            queryResult.items.map((item: ExerciseActivityQueryItem) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/80 border transition-all text-xs gap-2"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {exerciseDisplayLabel(item.exerciseName, t, false)}
                    </span>
                    {item.category && (
                      <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize">
                        {exerciseDisplayLabel(item.category, t)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {item.entryDate}
                    </span>
                    {item.distanceFormatted && (
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <MapPin className="w-3 h-3 text-blue-500" />
                        {item.distanceFormatted} {isMiles ? 'mi' : 'km'}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.durationMinutes >= 10
                        ? Math.round(item.durationMinutes)
                        : Math.round(item.durationMinutes * 10) / 10}{' '}
                      {t('common.min', 'min')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right self-end sm:self-auto">
                  {item.formattedPace && (
                    <div>
                      <div className="text-[10px] text-muted-foreground">
                        {t('exerciseAnalytics.finder.avgPace', 'Avg Pace')}
                      </div>
                      <div className="font-semibold">{item.formattedPace}</div>
                    </div>
                  )}
                  {item.avgHeartRate && (
                    <div>
                      <div className="text-[10px] text-muted-foreground">
                        {t('exerciseAnalytics.finder.avgHeartRate', 'Avg HR')}
                      </div>
                      <div className="font-semibold text-red-500">
                        {item.avgHeartRate} bpm
                      </div>
                    </div>
                  )}
                  {item.caloriesBurned > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground">
                        {t('exerciseAnalytics.volume.calories', 'Calories')}
                      </div>
                      <div className="font-semibold text-amber-600">
                        {Math.round(item.caloriesBurned)} kcal
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-xs text-muted-foreground border rounded-lg bg-muted/20">
              {t(
                'exerciseAnalytics.finder.noMatches',
                'No activities matched the query filters.'
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
