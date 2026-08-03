import { z } from "zod";

export const backupFileInfoSchema = z.object({
  fileName: z.string(),
  size: z.number(),
  // Start of the backup run, parsed from the file name.
  createdAt: z.iso.datetime(),
  // Completion of the backup run, derived from the archive's mtime. Best
  // effort: mtime resets if the file is copied or moved.
  completedAt: z.iso.datetime(),
});

export const backupListResponseSchema = z.object({
  backups: z.array(backupFileInfoSchema),
});

export type BackupFileInfo = z.infer<typeof backupFileInfoSchema>;
export type BackupListResponse = z.infer<typeof backupListResponseSchema>;
