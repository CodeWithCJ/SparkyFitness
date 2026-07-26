import { useState, useEffect } from 'react';
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
import { Search, Trophy, Calendar, Clock, MapPin } from 'lucide-react';
import type {
  ExerciseActivityQueryResponse,
  ExerciseActivityQueryItem,
} from '@workspace/shared';

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
  const [distancePreset, setDistancePreset] = useState<string>('half_marathon');
  const [keyword, setKeyword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [queryResult, setQueryResult] =
    useState<ExerciseActivityQueryResponse | null>(null);

  const executeSearch = async (preset?: string, kw?: string) => {
    if (!onQueryFetch) return;
    setLoading(true);
    try {
      const res = await onQueryFetch({
        distanceStandard: preset !== undefined ? preset : distancePreset,
        searchKeyword: kw !== undefined ? kw : keyword,
      });
      setQueryResult(res);
    } catch (err) {
      console.error('Failed to query activities:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    executeSearch('half_marathon', '');
  }, []);

  return (
    <Card className="shadow-sm border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            Activity Interrogation & Distance Search
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Query and compare past activities by distance milestones, routes, or
          keywords (e.g. Half Marathons, 10ks, 5ks).
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
                <SelectValue placeholder="Distance Milestone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Distances</SelectItem>
                <SelectItem value="5k">5 km (3.1 mi)</SelectItem>
                <SelectItem value="10k">10 km (6.2 mi)</SelectItem>
                <SelectItem value="15k">15 km</SelectItem>
                <SelectItem value="half_marathon">
                  Half Marathon (21.1 km)
                </SelectItem>
                <SelectItem value="marathon">Marathon (42.2 km)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative flex-1 w-full">
            <Input
              type="text"
              placeholder="Search by notes or workout title..."
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
            {loading ? 'Querying...' : 'Search'}
          </Button>
        </div>

        {/* Results List */}
        <div className="space-y-2 mt-3">
          {queryResult && queryResult.items.length > 0 ? (
            queryResult.items.map((item: ExerciseActivityQueryItem) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg bg-muted/40 hover:bg-muted/80 border transition-all text-xs gap-2"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">
                      {item.exerciseName}
                    </span>
                    {item.category && (
                      <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize">
                        {item.category}
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
                        {item.distanceFormatted} km
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.durationMinutes} mins
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right self-end sm:self-auto">
                  {item.formattedPace && (
                    <div>
                      <div className="text-[10px] text-muted-foreground">
                        Avg Pace
                      </div>
                      <div className="font-semibold">{item.formattedPace}</div>
                    </div>
                  )}
                  {item.avgHeartRate && (
                    <div>
                      <div className="text-[10px] text-muted-foreground">
                        Avg HR
                      </div>
                      <div className="font-semibold text-red-500">
                        {item.avgHeartRate} bpm
                      </div>
                    </div>
                  )}
                  {item.caloriesBurned > 0 && (
                    <div>
                      <div className="text-[10px] text-muted-foreground">
                        Calories
                      </div>
                      <div className="font-semibold text-amber-600">
                        {item.caloriesBurned} kcal
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-xs text-muted-foreground border rounded-lg bg-muted/20">
              {loading
                ? 'Searching activity database...'
                : 'No activities matched the query filters.'}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
