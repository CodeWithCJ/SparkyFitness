import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Route, Repeat } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import type {
  MatchedCoursesResponse,
  MatchedCourseGroup,
} from '@workspace/shared';

interface MatchedCoursesListProps {
  matchedData?: MatchedCoursesResponse;
}

export const MatchedCoursesList = ({
  matchedData,
}: MatchedCoursesListProps) => {
  const { distanceUnit } = usePreferences();
  const isMiles = distanceUnit === 'miles';
  const courses = matchedData?.courses || [];

  if (courses.length === 0) {
    return null;
  }

  return (
    <Card className="shadow-sm border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Route className="w-5 h-5 text-indigo-600" />
            Matched Courses & Route History ("Matched Runs")
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Activities on recurring route loops grouped together to compare pace
          over time.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {courses.map((course: MatchedCourseGroup) => (
          <div
            key={course.courseId}
            className="p-3 rounded-lg border bg-muted/20 space-y-2"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-indigo-500" />
                <span className="font-semibold text-sm">
                  {course.courseName}
                </span>
                <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full font-medium">
                  {course.activityCount} runs
                </span>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-3">
                <span>
                  Avg: {course.avgDistanceFormatted} {isMiles ? 'mi' : 'km'}
                </span>
                <span className="font-medium text-foreground">
                  Best Pace: {course.bestPaceFormatted}
                </span>
              </div>
            </div>

            {/* Recent activities on this course */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {course.recentActivities.map((act) => (
                <div
                  key={act.activityId}
                  className="p-2 rounded bg-background border text-[11px] flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium text-xs">{act.entryDate}</div>
                    <div className="text-muted-foreground">
                      {act.durationMinutes} mins
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-indigo-600">
                      {act.avgPaceFormatted}
                    </div>
                    {act.avgHeartRate && (
                      <div className="text-[10px] text-red-500">
                        {act.avgHeartRate} bpm
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
