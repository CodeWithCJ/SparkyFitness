import { z } from "zod";

export const paginationSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  hasMore: z.boolean(),
});

export type Pagination = z.infer<typeof paginationSchema>;
