import { z } from "zod";

export const backupFileInfoSchema = z.object({
  fileName: z.string(),
  size: z.number(),
  createdAt: z.iso.datetime(),
});

export const backupListResponseSchema = z.object({
  backups: z.array(backupFileInfoSchema),
});

export type BackupFileInfo = z.infer<typeof backupFileInfoSchema>;
export type BackupListResponse = z.infer<typeof backupListResponseSchema>;
