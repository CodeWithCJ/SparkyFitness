import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, error } from '@/utils/logging';
import { getExerciseHistory } from '@/services/exerciseEntryService'; // Assuming this service exists
import { ExerciseEntry } from '@/services/exerciseEntryService'; // Assuming ExerciseEntry interface is defined here

interface ExerciseHistoryDisplayProps {
  exerciseId: string;
  limit?: number;
}

const ExerciseHistoryDisplay: React.FC<ExerciseHistoryDisplayProps> = ({ exerciseId, limit = 5 }) => {
  const { user } = useAuth();
  const { loggingLevel, weightUnit, convertWeight } = usePreferences();
  const [history, setHistory] = useState<ExerciseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMinimized, setIsMinimized] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user?.id || !exerciseId) return;
      setLoading(true);
      try {
        const fetchedHistory = await getExerciseHistory(exerciseId, limit);
        setHistory(fetchedHistory);
        debug(loggingLevel, `Fetched history for exercise ${exerciseId}:`, fetchedHistory);
      } catch (err) {
        error(loggingLevel, `Error fetching exercise history for ${exerciseId}:`, err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user?.id, exerciseId, limit, loggingLevel]);

  if (loading) {
    return <p className="text-center text-muted-foreground">Loading history...</p>;
  }

  if (history.length === 0) {
    return <p className="text-center text-muted-foreground">No previous entries found for this exercise.</p>;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-md font-semibold">Last {limit} Entries</CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setIsMinimized(!isMinimized)}>
            {isMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      {!isMinimized && (
        <CardContent>
          <div className="space-y-2">
            {history
              .filter(entry => new Date(entry.entry_date) <= new Date())
              .map((entry, index) => (
              <div key={entry.id || index} className="border-b pb-2 last:border-b-0">
                <p className="text-sm font-medium">{new Date(entry.entry_date).toLocaleDateString()}</p>
                <div className="text-xs text-muted-foreground">
                  {entry.sets && (
                    <div>
                      <strong>Sets:</strong>
                      {entry.sets.map((set, i) => (
                        <div key={i} className="pl-4">
                          {`${set.reps}x${Math.round(convertWeight(set.weight, 'kg', weightUnit))}${weightUnit}`}
                          {set.duration ? ` for ${set.duration}min` : ''}
                          {set.rest_time ? ` with ${set.rest_time}s rest` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  {entry.duration_minutes && <div> • Duration: {entry.duration_minutes} min</div>}
                  {entry.calories_burned && <div> • Calories: {Math.round(entry.calories_burned)}</div>}
                </div>
                {entry.notes && <p className="text-xs text-muted-foreground italic">Notes: {entry.notes}</p>}
                {entry.image_url && (
                  <img src={entry.image_url} alt="Exercise" className="w-16 h-16 object-cover mt-1 rounded" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

export default ExerciseHistoryDisplay;