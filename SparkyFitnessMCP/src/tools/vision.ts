import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AnalyzeFoodImageSchema, ScanLabelSchema } from "../schemas/vision.js";
import type { AnalyzeFoodImageInput, ScanLabelInput } from "../schemas/vision.js";
import * as visionService from "../services/visionService.js";
import type { ToolResponse } from "../types.js";

export function registerVisionTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_analyze_food_image",
    {
      title: "Analyze Food Image",
      description: "Analyzes an image of food to estimate its nutritional content using advanced vision models.",
      inputSchema: AnalyzeFoodImageSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs): Promise<ToolResponse> => {
      const args = rawArgs as unknown as AnalyzeFoodImageInput;
      return visionService.analyzeFoodImage(args.image_url);
    }
  );

  server.registerTool(
    "sparky_scan_label",
    {
      title: "Scan Nutrition Label",
      description: "Scans a nutrition label from an image to extract detailed nutritional information using OCR.",
      inputSchema: ScanLabelSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (rawArgs): Promise<ToolResponse> => {
      const args = rawArgs as unknown as ScanLabelInput;
      return visionService.scanLabel(args.image_url);
    }
  );
}
