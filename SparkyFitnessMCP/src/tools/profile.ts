import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { manageProfileSchema, manageProfileInput, type ManageProfileInput } from "../schemas/profile.js";
import * as profileService from "../services/profileService.js";
import { ERRORS } from "../utils/errors.js";
import { formatList, formatConfirmation, formatSuccess } from "../utils/formatting.js";
import type { ToolResponse } from "../types.js";

const VALID_ACTIONS = ["get_profile", "update_profile", "get_preferences", "update_preferences"];

export function registerProfileTools(server: McpServer, userId: string): void {
  server.registerTool(
    "sparky_manage_profile",
    {
      title: "Manage Profile",
      description: `User settings: update display name, timezone, and measurement units.
      
Actions:
- get_profile() — returns user account details
- update_profile(display_name?, email?, image?) — updates account details
- get_preferences() — returns user preferences (timezone, units)
- update_preferences(timezone?, energy_unit?, default_weight_unit?, default_distance_unit?) — updates preferences`,
      inputSchema: manageProfileInput,
    },
    async (rawArgs): Promise<ToolResponse> => {
      const parsed = manageProfileSchema.safeParse(rawArgs);
      if (!parsed.success) {
        return ERRORS.VALIDATION(parsed.error.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
      }
      const args: ManageProfileInput = parsed.data;
      try {
        switch (args.action) {
          case "get_profile": {
            const profile = await profileService.getProfile(userId);
            let text = `### User Profile\n\n`;
            text += `- **Name:** ${profile.name || "N/A"}\n`;
            text += `- **Email:** ${profile.email}\n`;
            text += `- **ID:** ${profile.id}\n`;

            
            return {
              content: [{ type: "text", text }],
              structuredContent: profile,
            };
          }

          case "update_profile": {
            const profile = await profileService.updateProfile(userId, {
              display_name: args.display_name,
              email: args.email,
              image: args.image,
            });
            return formatConfirmation(`Profile updated.`, { profile });
          }

          case "get_preferences": {
            const prefs = await profileService.getPreferences(userId);
            let text = `### User Preferences\n\n`;
            text += `- **Timezone:** ${prefs.timezone || "UTC"}\n`;
            text += `- **Energy Unit:** ${prefs.energy_unit || "kcal"}\n`;
            text += `- **Weight Unit:** ${prefs.default_weight_unit || "kg"}\n`;
            text += `- **Distance Unit:** ${prefs.default_distance_unit || "km"}\n`;
            
            return {
              content: [{ type: "text", text }],
              structuredContent: prefs,
            };
          }

          case "update_preferences": {
            const prefs = await profileService.updatePreferences(userId, {
              timezone: args.timezone,
              energy_unit: args.energy_unit,
              default_weight_unit: args.default_weight_unit,
              default_distance_unit: args.default_distance_unit,
            });
            return formatConfirmation(`Preferences updated.`, { preferences: prefs });
          }

          default:
            return ERRORS.INVALID_ACTION(String((args as any).action), VALID_ACTIONS);
        }
      } catch (error) {
        console.error("[Profile Tool] Error:", error);
        return ERRORS.DB_ERROR();
      }
    }
  );
}
