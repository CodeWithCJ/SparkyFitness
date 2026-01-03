import React from 'react';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, Pause, Play, X, AlertCircle, CheckCircle } from "lucide-react";
import { SyncJob } from '@/services/garminSyncService';

interface GarminSyncProgressProps {
  job: SyncJob;
  onResume: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const GarminSyncProgress: React.FC<GarminSyncProgressProps> = ({
  job,
  onResume,
  onCancel,
  loading = false
}) => {
  const getStatusIcon = () => {
    switch (job.status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <Loader2 className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (job.status) {
      case 'pending':
        return 'Starting...';
      case 'running':
        return job.currentChunkRange
          ? `Syncing ${job.currentChunkRange}...`
          : 'Syncing...';
      case 'paused':
        return 'Paused';
      case 'failed':
        return job.errorMessage || 'Sync failed';
      case 'completed':
        return 'Sync complete';
      case 'cancelled':
        return 'Cancelled';
      default:
        return job.status;
    }
  };

  const showResumeButton = job.status === 'paused' || job.status === 'failed';
  const showCancelButton = job.status === 'running' || job.status === 'pending';

  return (
    <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-sm font-medium">
            {job.syncType === 'historical' ? 'Historical Import' : 'Sync'}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          {job.percentComplete}%
        </span>
      </div>

      <Progress value={job.percentComplete} className="h-2" />

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {getStatusText()}
        </span>
        <span className="text-xs text-muted-foreground">
          {job.chunksCompleted} / {job.chunksTotal} chunks
        </span>
      </div>

      {(showResumeButton || showCancelButton) && (
        <div className="flex gap-2 pt-1">
          {showResumeButton && (
            <Button
              size="sm"
              variant="outline"
              onClick={onResume}
              disabled={loading}
              className="h-7 text-xs"
            >
              <Play className="h-3 w-3 mr-1" />
              Resume
            </Button>
          )}
          {showCancelButton && (
            <Button
              size="sm"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="h-7 text-xs"
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      )}

      {job.failedChunks && job.failedChunks.length > 0 && (
        <div className="text-xs text-red-500 mt-1">
          {job.failedChunks.length} chunk(s) failed - will retry on resume
        </div>
      )}
    </div>
  );
};

export default GarminSyncProgress;
