import { z } from "zod";

export const AnalyzeFoodImageSchema = z.object({
  image_url: z.string().min(1).describe("Base64 encoded image data or URL"),
}).strict();

export const ScanLabelSchema = z.object({
  image_url: z.string().min(1).describe("Base64 encoded image data or URL"),
}).strict();

export type AnalyzeFoodImageInput = z.infer<typeof AnalyzeFoodImageSchema>;
export type ScanLabelInput = z.infer<typeof ScanLabelSchema>;
