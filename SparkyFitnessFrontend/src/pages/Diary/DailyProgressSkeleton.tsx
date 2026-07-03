import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
export const DailyProgressSkeleton = () => (
  <div>
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center space-x-2 text-base">
          <Skeleton className="w-4 h-4 rounded-full" />
          <Skeleton className="h-4 w-48" />
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-4">
          <div className="flex items-center justify-center">
            <div className="relative w-32 h-32 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1">
                <Skeleton className="h-6 w-12" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-6 w-12 mx-auto" />
                <Skeleton className="h-3 w-16 mx-auto" />
              </div>
            ))}
          </div>

          <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-slate-800 space-y-1">
            <Skeleton className="h-4 w-full mx-auto" />
            <Skeleton className="h-3 w-full mx-auto" />
          </div>

          <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-slate-800">
            <Skeleton className="h-4 w-full mx-auto" />
            <Skeleton className="h-3 w-full mx-auto mt-1" />
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
);
